import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../../src/core/task.js';
import { createTask } from '../../../src/core/types.js';

function generateDag(numTasks: number, sparsity = 0.3): string[] {
  // Generates a set of task IDs where ~sparsity fraction have no dependencies
  const ids: string[] = [];
  for (let i = 0; i < numTasks; i++) ids.push(`t${i}`);
  return ids;
}

describe('TaskQueue properties', () => {
  it('no duplicate task IDs across 1000 enqueues', () => {
    const q = new TaskQueue();
    for (let i = 0; i < 1000; i++) {
      q.enqueue(createTask({ id: `task-${i}`, name: `T${i}`, description: 'd', dependencies: [] }));
    }
    const ids = q.allTasks().map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(1000);
  });

  it('all entry-point tasks are ready when no dependencies', () => {
    const q = new TaskQueue();
    const ids = generateDag(50);
    for (const id of ids) {
      q.enqueue(createTask({ id, name: id, description: 'd', dependencies: [] }));
    }
    const ready = q.getReady();
    expect(ready.length).toBe(50);
  });

  it('depsComplete returns false for missing dependency', () => {
    const q = new TaskQueue();
    q.enqueue(createTask({ id: 'orphan', name: 'O', description: 'd', dependencies: ['nonexistent'] }));
    const blocked = q.getBlocked();
    expect(blocked.length).toBe(1);
  });

  it('isComplete is true only when all tasks done or failed', () => {
    const q = new TaskQueue();
    q.enqueue(createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] }));
    q.enqueue(createTask({ id: 't2', name: 'T2', description: 'd', dependencies: [] }));
    expect(q.isComplete()).toBe(false);
    q.complete('t1', { output: 'ok', artifacts: [] });
    expect(q.isComplete()).toBe(false);
    q.complete('t2', { output: 'ok', artifacts: [] });
    expect(q.isComplete()).toBe(true);
  });

  it('completed tasks unblock exactly one dependent task', () => {
    const q = new TaskQueue();
    q.enqueue(createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] }));
    q.enqueue(createTask({ id: 't2', name: 'T2', description: 'd', dependencies: ['t1'] }));
    q.enqueue(createTask({ id: 't3', name: 'T3', description: 'd', dependencies: ['t1'] }));
    expect(q.getReady().length).toBe(1); // only t1
    expect(q.getBlocked().length).toBe(2); // t2, t3
    q.complete('t1', { output: 'ok', artifacts: [] });
    expect(q.getReady().length).toBe(2); // t2, t3 now ready
    expect(q.getBlocked().length).toBe(0);
  });

  it('size is consistent with allTasks length', () => {
    const q = new TaskQueue();
    for (let i = 0; i < 100; i++) {
      q.enqueue(createTask({ id: `t${i}`, name: `T${i}`, description: 'd', dependencies: [] }));
    }
    expect(q.size()).toBe(100);
    expect(q.allTasks().length).toBe(100);
  });

  it('dequeue returns tasks in submission order', () => {
    const q = new TaskQueue();
    for (let i = 0; i < 10; i++) {
      q.enqueue(createTask({ id: `t${i}`, name: `T${i}`, description: 'd', dependencies: [] }));
    }
    const order: string[] = [];
    let task;
    while ((task = q.dequeue()) !== null) {
      order.push(task.id);
    }
    expect(order).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9']);
  });

  it('multiple completions + failures still marks isComplete correctly', () => {
    const q = new TaskQueue();
    q.enqueue(createTask({ id: 'a', name: 'A', description: 'd', dependencies: [] }));
    q.enqueue(createTask({ id: 'b', name: 'B', description: 'd', dependencies: [] }));
    q.complete('a', { output: 'ok', artifacts: [] });
    q.fail('b', new Error('boom'));
    expect(q.isComplete()).toBe(true);
    expect(q.getStatus('a')).toBe('completed');
    expect(q.getStatus('b')).toBe('failed');
  });
});
