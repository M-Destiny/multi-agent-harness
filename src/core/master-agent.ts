import type { AgentConfig, AgentMessage, Task, TaskContext, TaskResult, Workflow, WorkflowResult } from './types.js';
import { BaseAgent } from './types.js';
import type { MemoryStore } from './memory/store.js';
import type { SubAgent } from './sub-agent.js';
import { TaskQueue } from './task.js';
import { parallelMap } from '../utils/parallel.js';
import { createA2AClient } from './a2a/client.js';
import type { A2AMessage } from './a2a/types.js';

export class MasterAgent extends BaseAgent {
  private readonly _subAgents: SubAgent[] = [];
  private readonly queue = new TaskQueue();

  constructor(config: AgentConfig, memoryStore: MemoryStore) {
    super(config, memoryStore);
  }

  get subAgents(): readonly SubAgent[] { return this._subAgents; }

  addSubAgent(agent: SubAgent): void {
    this._subAgents.push(agent);
  }

  override async initialize(): Promise<void> {
    if (this.initialized) return;
    this.emit({ type: 'agent_spawn', agentId: this.id, timestamp: new Date() });
    await Promise.all(this._subAgents.map((a) => a.initialize()));
    this.initialized = true;
  }

  override async shutdown(): Promise<void> {
    await Promise.all(this._subAgents.map((a) => a.shutdown()));
    this.initialized = false;
  }

  async executeWorkflow(workflow: Workflow, maxConcurrency = 3): Promise<WorkflowResult> {
    const startedAt = new Date();
    workflow.status = 'running';
    workflow.updatedAt = startedAt;
    for (const task of workflow.tasks) this.queue.enqueue(task);

    const taskResults = new Map<string, TaskResult>();

    while (!this.queue.isComplete()) {
      const ready = this.queue.getReady();
      if (ready.length === 0) {
        // Nothing ready and not complete means deadlock or blocked
        if (this.queue.getRunning().length === 0) {
          workflow.status = 'failed';
          break;
        }
        // Wait for running tasks to finish — in a real system we'd await them
        break;
      }

      const results = await parallelMap(ready, maxConcurrency, async (task) => {
        const agent = this.pickAgent(task);
        if (!agent) {
          const fallbackResult: TaskResult = { output: null, artifacts: [] };
          this.queue.complete(task.id, fallbackResult);
          return { taskId: task.id, result: fallbackResult };
        }
        this.queue.markRunning(task.id);
        const ctx: TaskContext = {
          workflowId: workflow.id,
          sharedMemory: {},
          variables: {},
        };
        this.emit({ type: 'delegation', fromAgentId: this.id, toAgentId: agent.id, taskId: task.id, context: ctx, timestamp: new Date() });
        try {
          const result = await agent.execute(task, ctx);
          this.queue.complete(task.id, result);
          return { taskId: task.id, result };
        } catch (e) {
          this.queue.fail(task.id, e instanceof Error ? e : new Error(String(e)));
          return { taskId: task.id, result: { output: null, artifacts: [] } as TaskResult };
        }
      });

      for (const { taskId, result } of results) taskResults.set(taskId, result);
    }

    const completedAt = new Date();
    const allCompleted = workflow.tasks.every((t) => this.queue.getStatus(t.id) === 'completed');
    workflow.status = allCompleted ? 'completed' : 'failed';
    workflow.updatedAt = completedAt;

    return {
      workflowId: workflow.id,
      status: workflow.status,
      taskResults,
      startedAt,
      completedAt,
      totalDurationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  async delegate(task: Task, toAgent: SubAgent, context?: TaskContext): Promise<TaskResult> {
    this.emit({ type: 'delegation', fromAgentId: this.id, toAgentId: toAgent.id, taskId: task.id, context, timestamp: new Date() });
    return toAgent.execute(task, context);
  }

  async delegateToA2A(agentUrl: string, task: Task, context?: TaskContext, auth?: { scheme: 'bearer' | 'apiKey'; token?: string }): Promise<TaskResult> {
    const client = createA2AClient({ baseUrl: agentUrl, auth });
    
    // 1. Discover capabilities
    const card = await client.discover();
    this.emit({ type: 'delegation', fromAgentId: this.id, toAgentId: card.name, taskId: task.id, context, timestamp: new Date() });
    
    // 2. Map Task to A2AMessage
    const message: A2AMessage = {
      role: 'user',
      parts: [{ type: 'text', text: task.input }]
    };
    
    // 3. Send Task
    const a2aTask = await client.sendTask(message, { streaming: card.capabilities.streaming });
    
    let finalTask = a2aTask;
    if (card.capabilities.streaming) {
      for await (const update of client.subscribeTask(a2aTask.id)) {
        if (update.status === 'completed' || update.status === 'failed' || update.status === 'canceled') {
          // fetch final state
          finalTask = await client.getTask(a2aTask.id);
          break;
        }
      }
    } else {
      // Poll until finished
      let status = a2aTask.status;
      while (status === 'submitted' || status === 'working' || status === 'input-required') {
        await new Promise(resolve => setTimeout(resolve, 500));
        finalTask = await client.getTask(a2aTask.id);
        status = finalTask.status;
      }
    }
    
    if (finalTask.status === 'failed') {
      throw new Error(`A2A delegation failed: ${finalTask.message?.parts?.[0]?.text || 'Unknown error'}`);
    }
    
    return {
      output: finalTask.message?.parts?.[0]?.text || '',
      artifacts: finalTask.artifacts?.map(art => ({
        name: art.name,
        type: art.parts?.[0]?.type || 'file',
        content: art.parts?.[0]?.text || JSON.stringify(art.parts?.[0]?.data) || '',
      })) || [],
    };
  }

  broadcast(message: AgentMessage, targets?: SubAgent[]): void {
    const recipients = targets ?? this._subAgents;
    for (const agent of recipients) {
      // In a real system agents would have message queues
      this.emit({ type: 'task_start', taskId: `broadcast-${message.type}`, agentId: agent.id, timestamp: new Date() });
    }
  }

  private pickAgent(task: Task): SubAgent | null {
    // Explicit assignment takes priority
    if (task.assignedAgentId) {
      const found = this._subAgents.find((a) => a.id === task.assignedAgentId);
      if (found) return found;
    }
    // Find an agent that can handle it
    for (const agent of this._subAgents) {
      if (agent.canHandle(task)) return agent;
    }
    return this._subAgents[0] ?? null;
  }
}
