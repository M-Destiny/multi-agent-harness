import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import { SqliteStore } from '../../../src/core/memory/sqlite-store.js';
import { TaskQueue } from '../../../src/core/task.js';
import { createTask, createWorkflow } from '../../../src/core/types.js';

describe('InMemoryStore', () => {
  it('should set and get values', async () => {
    const store = new InMemoryStore();
    await store.set('ns', 'key1', { value: 42 });
    const result = await store.get('ns', 'key1');
    expect(result).toEqual({ value: 42 });
  });

  it('should return null for missing keys', async () => {
    const store = new InMemoryStore();
    const result = await store.get('ns', 'missing');
    expect(result).toBeNull();
  });

  it('should support TTL expiration', async () => {
    const store = new InMemoryStore();
    await store.set('ns', 'temp', 'val', 50);
    expect(await store.get('ns', 'temp')).toBe('val');
    await new Promise((r) => setTimeout(r, 60));
    expect(await store.get('ns', 'temp')).toBeNull();
  });

  it('should list keys with prefix filter', async () => {
    const store = new InMemoryStore();
    await store.set('ns', 'user:1', 'a');
    await store.set('ns', 'user:2', 'b');
    await store.set('ns', 'config', 'c');
    const keys = await store.list('ns', 'user:');
    expect(keys.sort()).toEqual(['user:1', 'user:2']);
  });

  it('should snapshot and restore', async () => {
    const store = new InMemoryStore();
    await store.set('ns', 'k1', 'v1');
    const snap = await store.snapshot();
    const store2 = new InMemoryStore();
    await store2.restore(snap);
    expect(await store2.get('ns', 'k1')).toBe('v1');
  });
});

describe('SqliteStore', () => {
  it('should set and get values with in-memory DB', async () => {
    const store = new SqliteStore(':memory:');
    await store.set('ns', 'key1', { value: 42 });
    const result = await store.get('ns', 'key1');
    expect(result).toEqual({ value: 42 });
    store.close();
  });

  it('should handle delete and clear', async () => {
    const store = new SqliteStore(':memory:');
    await store.set('ns', 'k1', 'v1');
    await store.set('ns', 'k2', 'v2');
    await store.delete('ns', 'k1');
    expect(await store.get('ns', 'k1')).toBeNull();
    await store.clear('ns');
    expect(await store.get('ns', 'k2')).toBeNull();
    store.close();
  });
});

describe('TaskQueue', () => {
  it('should dequeue tasks with completed dependencies', () => {
    const t1 = createTask({ id: 't1', name: 'Task 1', description: 'First', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'Task 2', description: 'Second', dependencies: ['t1'] });
    const q = new TaskQueue();
    q.enqueue(t1);
    q.enqueue(t2);
    // t1 should be ready, t2 blocked
    const ready = q.getReady();
    expect(ready.map((t) => t.id)).toEqual(['t1']);
    expect(q.getBlocked().map((t) => t.id)).toEqual(['t2']);
  });

  it('should unblock tasks when dependencies complete', () => {
    const t1 = createTask({ id: 't1', name: 'Task 1', description: 'First', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'Task 2', description: 'Second', dependencies: ['t1'] });
    const q = new TaskQueue();
    q.enqueue(t1);
    q.enqueue(t2);
    q.complete('t1', { output: 'done', artifacts: [] });
    const ready = q.getReady();
    expect(ready.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('createWorkflow', () => {
  it('should compute entry points from tasks with no dependencies', () => {
    const t1 = createTask({ id: 't1', name: 'T1', description: 'd1', dependencies: [] });
    const t2 = createTask({ id: 't2', name: 'T2', description: 'd2', dependencies: ['t1'] });
    const wf = createWorkflow({ id: 'wf1', name: 'Test', tasks: [t1, t2] });
    expect(wf.entryPoints).toEqual(['t1']);
    expect(wf.status).toBe('pending');
  });
});
