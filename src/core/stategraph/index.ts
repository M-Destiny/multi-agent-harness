import type { Checkpointer, Checkpoint, CheckpointMetadata, CompileOptions, Edge, ConditionalEdge, NodeFn, StateSnapshot, GraphInterrupt, ResumeOptions, GraphResult } from '../types.js';

interface NodeConfig<S> {
  fn: NodeFn<S>;
  edges: Edge[];
  conditionalEdges: ConditionalEdge[];
}

export class StateGraph<S extends Record<string, unknown>> {
  protected nodes = new Map<string, NodeConfig<S>>();
  protected entryPoint: string | null = null;
  protected finishPoints = new Set<string>();

  addNode(name: string, fn: NodeFn<S>): this {
    this.nodes.set(name, { fn, edges: [], conditionalEdges: [] });
    return this;
  }

  addEdge(from: string, to: string): this {
    const node = this.nodes.get(from);
    if (!node) throw new Error(`Node "${from}" not found`);
    node.edges.push({ from, to });
    return this;
  }

  addConditionalEdges(from: string, route: (state: S) => string | string[], pathMap: Record<string, string>): this {
    const node = this.nodes.get(from);
    if (!node) throw new Error(`Node "${from}" not found`);
    node.conditionalEdges.push({ from, route: route as (state: unknown) => string | string[], pathMap });
    return this;
  }

  setEntryPoint(node: string): this {
    if (!this.nodes.has(node)) throw new Error(`Node "${node}" not found`);
    this.entryPoint = node;
    return this;
  }

  setFinishPoint(node: string): this {
    if (!this.nodes.has(node)) throw new Error(`Node "${node}" not found`);
    this.finishPoints.add(node);
    return this;
  }

  compile(options?: CompileOptions): CompiledGraph<S> {
    return new CompiledGraph(this, options);
  }

  getEntryPoint(): string | null {
    return this.entryPoint;
  }

  getFinishPoints(): Set<string> {
    return this.finishPoints;
  }

  getNodes(): Map<string, NodeConfig<S>> {
    return this.nodes;
  }
}

export class CompiledGraph<S extends Record<string, unknown>> {
  private graph: StateGraph<S>;
  private options: CompileOptions;
  private checkpointer: Checkpointer | undefined;

  constructor(graph: StateGraph<S>, options?: CompileOptions) {
    this.graph = graph;
    this.options = options ?? {};
    this.checkpointer = this.options.checkpointer;
  }

  async invoke(input: S, config: { threadId: string }): Promise<GraphResult<S>> {
    const threadId = config.threadId;
    let state = input;
    let currentNode = this.graph.getEntryPoint();
    let step = 0;

    while (currentNode) {
      const nodeConfig = this.graph.getNodes().get(currentNode);
      if (!nodeConfig) throw new Error(`Node "${currentNode}" not found`);

      // Check interruptBefore
      if (this.options.interruptBefore?.includes(currentNode)) {
        const checkpoint = await this.saveCheckpoint(threadId, state, currentNode, 'interrupt_before', step);
        const interrupt = new Error(`Graph interrupted at ${currentNode}`) as GraphInterrupt;
        interrupt.threadId = threadId;
        interrupt.checkpointId = checkpoint.checkpointId;
        interrupt.interruptNode = currentNode;
        interrupt.state = state;
        interrupt.status = 'interrupt_before';
        throw interrupt;
      }

      // Execute node
      const partial = await nodeConfig.fn(state);
      state = { ...state, ...partial } as S;
      step++;

      // Check interruptAfter
      if (this.options.interruptAfter?.includes(currentNode)) {
        const checkpoint = await this.saveCheckpoint(threadId, state, currentNode, 'interrupt_after', step);
        const interrupt = new Error(`Graph interrupted at ${currentNode}`) as GraphInterrupt;
        interrupt.threadId = threadId;
        interrupt.checkpointId = checkpoint.checkpointId;
        interrupt.interruptNode = currentNode;
        interrupt.state = state;
        interrupt.status = 'interrupt_after';
        throw interrupt;
      }

      // Check if this is a finish point - if so, we're done after this node
      if (this.graph.getFinishPoints().has(currentNode)) {
        break;
      }

      // Determine next node
      const nextNode = this.getNextNode(currentNode, state);
      if (!nextNode) break;
      currentNode = nextNode;
    }

    // Final checkpoint
    if (this.checkpointer && threadId) {
      const finalNode = currentNode ?? 'end';
      await this.saveCheckpoint(threadId, state, finalNode, 'completed', step);
    }

    return { state, status: 'completed' };
  }

  async resume(options: ResumeOptions): Promise<GraphResult<S>> {
    const { threadId, checkpointId, editedState } = options;

    if (!this.checkpointer) throw new Error('Checkpointer required for resume');

    const checkpoint = await this.checkpointer.get(threadId, checkpointId);
    if (!checkpoint) throw new Error(`Checkpoint ${checkpointId} not found for thread ${threadId}`);

    let state = (editedState ?? checkpoint.state) as S;
    // Resume from the node where the interrupt happened (the node in checkpoint metadata)
    let currentNode = checkpoint.metadata.node ?? this.graph.getEntryPoint() ?? '';
    let step = checkpoint.metadata.step;
    let isFirstNode = true;

    while (currentNode) {
      const nodeConfig = this.graph.getNodes().get(currentNode);
      if (!nodeConfig) throw new Error(`Node "${currentNode}" not found`);

      // Skip interruptBefore on the first node when resuming (we're already past the interrupt point)
      if (!isFirstNode && this.options.interruptBefore?.includes(currentNode)) {
        const cp = await this.saveCheckpoint(threadId, state, currentNode, 'interrupt_before', step);
        const interrupt = new Error(`Graph interrupted at ${currentNode}`) as GraphInterrupt;
        interrupt.threadId = threadId;
        interrupt.checkpointId = cp.checkpointId;
        interrupt.interruptNode = currentNode;
        interrupt.state = state;
        interrupt.status = 'interrupt_before';
        throw interrupt;
      }
      isFirstNode = false;

      const partial = await nodeConfig.fn(state);
      state = { ...state, ...partial } as S;
      step++;

      if (this.options.interruptAfter?.includes(currentNode)) {
        const cp = await this.saveCheckpoint(threadId, state, currentNode, 'interrupt_after', step);
        const interrupt = new Error(`Graph interrupted at ${currentNode}`) as GraphInterrupt;
        interrupt.threadId = threadId;
        interrupt.checkpointId = cp.checkpointId;
        interrupt.interruptNode = currentNode;
        interrupt.state = state;
        interrupt.status = 'interrupt_after';
        throw interrupt;
      }

      // Check if this is a finish point - if so, we're done after this node
      if (this.graph.getFinishPoints().has(currentNode)) {
        break;
      }

      // Determine next node
      const nextNode = this.getNextNode(currentNode, state);
      if (!nextNode) break;
      currentNode = nextNode;
    }

    // Final checkpoint
    if (this.checkpointer && threadId) {
      const finalNode = currentNode ?? 'end';
      await this.saveCheckpoint(threadId, state, finalNode, 'completed', step);
    }

    return { state, status: 'completed' };
  }

  async getState(config: { threadId: string }): Promise<StateSnapshot<S> | null> {
    if (!this.checkpointer) return null;
    const checkpoint = await this.checkpointer.get(config.threadId);
    if (!checkpoint) return null;
    return {
      values: checkpoint.state as S,
      next: checkpoint.metadata.node ? [checkpoint.metadata.node] : [],
      tasks: [],
      metadata: { checkpointId: checkpoint.checkpointId, step: checkpoint.metadata.step },
    };
  }

  private getNextNode(currentNode: string, state: S): string | null {
    const nodeConfig = this.graph.getNodes().get(currentNode);
    if (!nodeConfig) return null;

    // Check conditional edges first
    for (const cond of nodeConfig.conditionalEdges) {
      const result = cond.route(state);
      const targets = Array.isArray(result) ? result : [result];
      for (const target of targets) {
        const mapped = cond.pathMap[target];
        if (mapped && this.graph.getNodes().has(mapped)) {
          return mapped;
        }
      }
    }

    // Regular edges
    if (nodeConfig.edges.length > 0) {
      const edge = nodeConfig.edges[0];
      if (edge !== undefined) return edge.to;
    }

    return null;
  }

  private async saveCheckpoint(threadId: string, state: S, node: string, status: string, step: number): Promise<Checkpoint> {
    if (!this.checkpointer) {
      return { threadId, checkpointId: crypto.randomUUID(), state, metadata: { step, timestamp: new Date(), node, tags: [status] }, createdAt: new Date() };
    }

    const checkpoint: Checkpoint = {
      threadId,
      checkpointId: crypto.randomUUID(),
      state,
      metadata: {
        step,
        timestamp: new Date(),
        node,
        tags: [status],
      },
      createdAt: new Date(),
    };

    await this.checkpointer.put(checkpoint);
    return checkpoint;
  }
}