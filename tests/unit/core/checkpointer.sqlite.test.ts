import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteCheckpointer } from '../../../src/core/checkpointer/sqlite.js';
import type { Checkpoint, CheckpointMetadata } from '../../../src/core/types.js';
import { unlinkSync, existsSync } from 'node:fs';

describe('SqliteCheckpointer', () => {
  let checkpointer: SqliteCheckpointer;
  const dbPath = './.harness/test-checkpoints.db';
  const threadId = 'test-thread-1';

  const createCheckpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
    threadId,
    checkpointId: crypto.randomUUID(),
    parentCheckpointId: undefined,
    state: { step: 1, data: 'test' },
    metadata: {
      step: 1,
      timestamp: new Date(),
      node: 'test-node',
      tags: ['test'],
    } as CheckpointMetadata,
    createdAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    checkpointer = new SqliteCheckpointer(dbPath);
  });

  afterEach(() => {
    checkpointer.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    // Also clean up WAL and SHM files
    if (existsSync(`${dbPath}-wal`)) unlinkSync(`${dbPath}-wal`);
    if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
  });

  it('should return null for non-existent thread', async () => {
    const result = await checkpointer.get('non-existent');
    expect(result).toBeNull();
  });

  it('should store and retrieve a checkpoint', async () => {
    const checkpoint = createCheckpoint();
    await checkpointer.put(checkpoint);

    const retrieved = await checkpointer.get(threadId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.threadId).toBe(threadId);
    expect(retrieved!.checkpointId).toBe(checkpoint.checkpointId);
    expect(retrieved!.state).toEqual(checkpoint.state);
  });

  it('should retrieve specific checkpoint by ID', async () => {
    const checkpoint1 = createCheckpoint({ checkpointId: 'cp-1', metadata: { ...createCheckpoint().metadata, step: 1 } });
    const checkpoint2 = createCheckpoint({ checkpointId: 'cp-2', metadata: { ...createCheckpoint().metadata, step: 2 } });

    await checkpointer.put(checkpoint1);
    await checkpointer.put(checkpoint2);

    const retrieved = await checkpointer.get(threadId, 'cp-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.checkpointId).toBe('cp-1');
    expect(retrieved!.metadata.step).toBe(1);
  });

  it('should return latest checkpoint when no ID specified', async () => {
    const baseTime = Date.now();
    const checkpoint1 = createCheckpoint({ 
      checkpointId: 'cp-1', 
      metadata: { ...createCheckpoint().metadata, step: 1 },
      createdAt: new Date(baseTime)
    });
    const checkpoint2 = createCheckpoint({ 
      checkpointId: 'cp-2', 
      metadata: { ...createCheckpoint().metadata, step: 2 },
      createdAt: new Date(baseTime + 1000)
    });

    await checkpointer.put(checkpoint1);
    await checkpointer.put(checkpoint2);

    const retrieved = await checkpointer.get(threadId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.checkpointId).toBe('cp-2');
    expect(retrieved!.metadata.step).toBe(2);
  });

  it('should list all checkpoints for a thread in order', async () => {
    const checkpoint1 = createCheckpoint({ checkpointId: 'cp-1', metadata: { ...createCheckpoint().metadata, step: 1 } });
    const checkpoint2 = createCheckpoint({ checkpointId: 'cp-2', metadata: { ...createCheckpoint().metadata, step: 2 } });
    const checkpoint3 = createCheckpoint({ checkpointId: 'cp-3', metadata: { ...createCheckpoint().metadata, step: 3 } });

    await checkpointer.put(checkpoint1);
    await checkpointer.put(checkpoint2);
    await checkpointer.put(checkpoint3);

    const checkpoints = await checkpointer.list(threadId);
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints[0].checkpointId).toBe('cp-1');
    expect(checkpoints[1].checkpointId).toBe('cp-2');
    expect(checkpoints[2].checkpointId).toBe('cp-3');
  });

  it('should delete all checkpoints for a thread', async () => {
    const checkpoint = createCheckpoint();
    await checkpointer.put(checkpoint);

    await checkpointer.delete(threadId);

    const result = await checkpointer.get(threadId);
    expect(result).toBeNull();
    const list = await checkpointer.list(threadId);
    expect(list).toHaveLength(0);
  });

  it('should handle multiple threads independently', async () => {
    const cp1 = createCheckpoint({ threadId: 'thread-1', checkpointId: 'cp-1' });
    const cp2 = createCheckpoint({ threadId: 'thread-2', checkpointId: 'cp-2' });

    await checkpointer.put(cp1);
    await checkpointer.put(cp2);

    const result1 = await checkpointer.get('thread-1');
    const result2 = await checkpointer.get('thread-2');

    expect(result1?.checkpointId).toBe('cp-1');
    expect(result2?.checkpointId).toBe('cp-2');
  });

  it('should handle parent checkpoint references', async () => {
    const parent = createCheckpoint({ checkpointId: 'parent', metadata: { ...createCheckpoint().metadata, step: 1 } });
    const child = createCheckpoint({ 
      checkpointId: 'child', 
      parentCheckpointId: 'parent',
      metadata: { ...createCheckpoint().metadata, step: 2 } 
    });

    await checkpointer.put(parent);
    await checkpointer.put(child);

    const retrieved = await checkpointer.get(threadId, 'child');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.parentCheckpointId).toBe('parent');
  });

  it('should persist checkpoints across instances', async () => {
    const checkpoint = createCheckpoint({ checkpointId: 'persistent-cp' });
    await checkpointer.put(checkpoint);
    checkpointer.close();

    // Create new instance with same DB
    const newCheckpointer = new SqliteCheckpointer(dbPath);
    const retrieved = await newCheckpointer.get(threadId);
    
    expect(retrieved).not.toBeNull();
    expect(retrieved!.checkpointId).toBe('persistent-cp');
    
    newCheckpointer.close();
  });

  it('should handle complex state objects', async () => {
    const complexState = {
      workflow: { id: 'wf-1', name: 'Test Workflow' },
      tasks: [
        { id: 't1', status: 'completed', result: { output: 'done' } },
        { id: 't2', status: 'running', result: null },
      ],
      variables: { userInput: 'test', config: { retries: 3 } },
      nested: { deep: { value: 42 } },
    };

    const checkpoint = createCheckpoint({ 
      state: complexState,
      checkpointId: 'complex-state' 
    });

    await checkpointer.put(checkpoint);
    const retrieved = await checkpointer.get(threadId);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.state).toEqual(complexState);
  });
});