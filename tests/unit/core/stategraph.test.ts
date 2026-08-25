import { describe, it, expect, beforeEach } from 'vitest';
import { StateGraph } from '../../../src/core/stategraph/index.js';
import { InMemoryCheckpointer } from '../../../src/core/checkpointer/in-memory.js';

interface TestState {
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
});