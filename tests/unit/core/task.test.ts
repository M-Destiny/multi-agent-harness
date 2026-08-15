import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../../../src/core/task.js';
import { createTask } from '../../../src/core/types.js';

describe('TaskQueue', () => {
  let q: TaskQueue;

  beforeEach(() => { q = new TaskQueue(); });

  it('enqueue adds a task', () => {
    q.enqueue(createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] }));
    expect(q.size()).toBe(1);
  });

  it('dequeue returns ready tasks', () => {
    const t = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    q.enqueue(t);
    const dq = q.dequeue();
    expect(dq?.id).toBe('t1');
  });

  it('dequeue skips blocked tasks', () => {
    // t2 depends on t1. t2 is blocked until t1 completes.
    const t1 = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'T2', description: 'd', dependencies: ['t1'] });
    q.enqueue(t1); q.enqueue(t2);
    // dequeue returns t1 (ready), not null
    expect(q.dequeue()?.id).toBe('t1');
    // getBlocked shows t2 is waiting
    expect(q.getBlocked().map((t) => t.id)).toEqual(['t2']);
  });

  it('getReady returns all unblocked tasks', () => {
    const t1 = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'T2', description: 'd', dependencies: [] });
    q.enqueue(t1); q.enqueue(t2);
    const ready = q.getReady();
    expect(ready.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('getBlocked returns tasks with incomplete dependencies', () => {
    const t1 = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'T2', description: 'd', dependencies: ['t1'] });
    q.enqueue(t1); q.enqueue(t2);
    const blocked = q.getBlocked();
    expect(blocked.map((t) => t.id)).toEqual(['t2']);
  });

  it('complete unblocks dependent tasks', () => {
    const t1 = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'T2', description: 'd', dependencies: ['t1'] });
    q.enqueue(t1); q.enqueue(t2);
    q.complete('t1', { output: 'done', artifacts: [] });
    expect(q.getReady().map((t) => t.id)).toEqual(['t2']);
    expect(q.getBlocked()).toEqual([]);
  });

  it('fail marks task as failed', () => {
    const t = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    q.enqueue(t);
    q.fail('t1', new Error('boom'));
    expect(q.getStatus('t1')).toBe('failed');
  });

  it('markRunning sets status', () => {
    const t = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    q.enqueue(t);
    q.markRunning('t1');
    expect(q.getStatus('t1')).toBe('running');
  });

  it('isComplete is true when all done or failed', () => {
    const t = createTask({ id: 't1', name: 'T1', description: 'd', dependencies: [] });
    q.enqueue(t);
    expect(q.isComplete()).toBe(false);
    q.complete('t1', { output: 'ok', artifacts: [] });
    expect(q.isComplete()).toBe(true);
  });

  it('allTasks returns every task', () => {
    q.enqueue(createTask({ id: 't1', name: 'T', description: 'd', dependencies: [] }));
    q.enqueue(createTask({ id: 't2', name: 'T', description: 'd', dependencies: [] }));
    expect(q.allTasks()).toHaveLength(2);
  });
});
