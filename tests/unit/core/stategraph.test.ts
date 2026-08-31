import { describe, it, expect, beforeEach } from 'vitest';
import { StateGraph } from '../../../src/core/stategraph/index.js';
import { InMemoryCheckpointer } from '../../../src/core/checkpointer/in-memory.js';

interface TestState extends Record<string, unknown> {
  value: number;
  message: string;
}

describe('StateGraph', () => {
  let checkpointer: InMemoryCheckpointer;

  beforeEach(() => {
    checkpointer = new InMemoryCheckpointer();
  });

  it('should execute a simple linear graph', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('increment', async (state) => ({ value: state.value + 1 }))
      .addNode('setMessage', async (state) => ({ message: `Value is ${state.value}` }))
      .addEdge('increment', 'setMessage')
      .setEntryPoint('increment')
      .setFinishPoint('setMessage')
      .compile({ checkpointer });

    const result = await graph.invoke({ value: 0, message: '' }, { threadId: 'test-1' });
    expect(result.status).toBe('completed');
    expect(result.state.value).toBe(1);
    expect(result.state.message).toBe('Value is 1');
  });

  it('should execute graph with conditional edges', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('start', async (state) => ({ value: state.value }))
      .addNode('even', async (state) => ({ message: 'even' }))
      .addNode('odd', async (state) => ({ message: 'odd' }))
      .addEdge('start', 'even')
      .addConditionalEdges('start', (state) => (state.value % 2 === 0 ? 'even' : 'odd'), {
        even: 'even',
        odd: 'odd',
      })
      .setEntryPoint('start')
      .setFinishPoint('even')
      .setFinishPoint('odd')
      .compile({ checkpointer });

    // Test even path
    const resultEven = await graph.invoke({ value: 2, message: '' }, { threadId: 'test-even' });
    expect(resultEven.status).toBe('completed');
    expect(resultEven.state.message).toBe('even');

    // Test odd path
    const resultOdd = await graph.invoke({ value: 3, message: '' }, { threadId: 'test-odd' });
    expect(resultOdd.status).toBe('completed');
    expect(resultOdd.state.message).toBe('odd');
  });

  it('should interrupt before a node', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addEdge('step1', 'step2')
      .setEntryPoint('step1')
      .setFinishPoint('step2')
      .compile({ checkpointer, interruptBefore: ['step2'] });

    await expect(graph.invoke({ value: 0, message: '' }, { threadId: 'interrupt-test' }))
      .rejects.toThrow('Graph interrupted at step2');

    const state = await graph.getState({ threadId: 'interrupt-test' });
    expect(state).not.toBeNull();
    expect(state!.values.value).toBe(1);
  });

  it('should interrupt after a node', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addEdge('step1', 'step2')
      .setEntryPoint('step1')
      .setFinishPoint('step2')
      .compile({ checkpointer, interruptAfter: ['step1'] });

    await expect(graph.invoke({ value: 0, message: '' }, { threadId: 'interrupt-after-test' }))
      .rejects.toThrow('Graph interrupted at step1');

    const state = await graph.getState({ threadId: 'interrupt-after-test' });
    expect(state).not.toBeNull();
    expect(state!.values.value).toBe(1);
  });

  it('should resume from checkpoint with edited state', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addEdge('step1', 'step2')
      .setEntryPoint('step1')
      .setFinishPoint('step2')
      .compile({ checkpointer, interruptBefore: ['step2'] });

    // First run - should interrupt
    await expect(graph.invoke({ value: 0, message: '' }, { threadId: 'resume-test' }))
      .rejects.toThrow('Graph interrupted at step2');

    // Resume with edited state
    const result = await graph.resume({
      threadId: 'resume-test',
      checkpointId: (await checkpointer.list('resume-test'))[0].checkpointId,
      editedState: { value: 100, message: 'edited' },
    });

    expect(result.status).toBe('completed');
    expect(result.state.value).toBe(110); // 100 + 10
    expect(result.state.message).toBe('edited');
  });

  it('should handle cycles with counter', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('increment', async (state) => ({ 
        value: state.value + 1,
        message: state.value >= 3 ? 'done' : 'continue'
      }))
      .addConditionalEdges('increment', (state) => 
        state.value >= 3 ? 'finish' : 'increment', 
        { finish: 'finish', increment: 'increment' }
      )
      .addNode('finish', async (state) => ({ message: 'done' }))
      .setEntryPoint('increment')
      .setFinishPoint('finish')
      .compile({ checkpointer });

    const result = await graph.invoke({ value: 0, message: '' }, { threadId: 'cycle-test' });
    expect(result.status).toBe('completed');
    expect(result.state.value).toBe(3);
    expect(result.state.message).toBe('done');
  });

  it('should stream state after each node', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addNode('step3', async (state) => ({ message: 'final' }))
      .addEdge('step1', 'step2')
      .addEdge('step2', 'step3')
      .setEntryPoint('step1')
      .setFinishPoint('step3')
      .compile({ checkpointer });

    const results: Array<{ state: TestState; node: string; step: number }> = [];
    for await (const chunk of graph.stream({ value: 0, message: '' }, { threadId: 'stream-test' })) {
      results.push(chunk);
    }

    expect(results).toHaveLength(3);
    expect(results[0].node).toBe('step1');
    expect(results[0].state.value).toBe(1);
    expect(results[0].step).toBe(1);
    
    expect(results[1].node).toBe('step2');
    expect(results[1].state.value).toBe(11);
    expect(results[1].step).toBe(2);
    
    expect(results[2].node).toBe('step3');
    expect(results[2].state.message).toBe('final');
    expect(results[2].step).toBe(3);
  });

  it('should update state and persist checkpoint', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addEdge('step1', 'step2')
      .setEntryPoint('step1')
      .setFinishPoint('step2')
      .compile({ checkpointer });

    // First, run to completion
    await graph.invoke({ value: 0, message: '' }, { threadId: 'update-test' });

    // Update state
    const snapshot = await graph.updateState({ threadId: 'update-test' }, { value: 999, message: 'updated' });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.values.value).toBe(999);
    expect(snapshot!.values.message).toBe('updated');
    expect(snapshot!.metadata.tags).toBeDefined();
    expect(snapshot!.metadata.tags).toContain('state_update');

    // Verify checkpoint was updated
    const checkpoints = await checkpointer.list('update-test');
    const latest = checkpoints[checkpoints.length - 1];
    expect(latest.state).toEqual({ value: 999, message: 'updated' });
    expect(latest.metadata.tags).toBeDefined();
    expect(latest.metadata.tags).toContain('state_update');
  });

  it('should stream with interruptBefore and allow resume', async () => {
    const graph = new StateGraph<TestState>()
      .addNode('step1', async (state) => ({ value: state.value + 1 }))
      .addNode('step2', async (state) => ({ value: state.value + 10 }))
      .addEdge('step1', 'step2')
      .setEntryPoint('step1')
      .setFinishPoint('step2')
      .compile({ checkpointer, interruptBefore: ['step2'] });

    const results: Array<{ state: TestState; node: string; step: number }> = [];
    
    // Stream should yield step1 then throw interrupt
    try {
      for await (const chunk of graph.stream({ value: 0, message: '' }, { threadId: 'stream-interrupt-test' })) {
        results.push(chunk);
      }
    } catch (e) {
      expect((e as Error).message).toContain('Graph interrupted at step2');
    }

    expect(results).toHaveLength(1);
    expect(results[0].node).toBe('step1');
    expect(results[0].state.value).toBe(1);

    // Resume from checkpoint
    const checkpoints = await checkpointer.list('stream-interrupt-test');
    const result = await graph.resume({
      threadId: 'stream-interrupt-test',
      checkpointId: checkpoints[0].checkpointId,
    });

    expect(result.status).toBe('completed');
    expect(result.state.value).toBe(11);
  });
});