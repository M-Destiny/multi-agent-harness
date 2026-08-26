import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer } from '../../../src/core/api/server.js';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import { SqliteCheckpointer } from '../../../src/core/checkpointer/sqlite.js';
import type { Workflow } from '../../../src/core/types.js';

describe('ApiServer & Studio Endpoints', () => {
  let checkpointer: SqliteCheckpointer;
  let server: ApiServer;
  let baseUrl: string;

  beforeEach(async () => {
    checkpointer = new SqliteCheckpointer(':memory:');
    server = new ApiServer(checkpointer, 0); // Bind to random free port
    baseUrl = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('GET /api/graph returns empty lists if no workflow active', async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    const data = await res.json();
    expect(data.nodes).toEqual([]);
    expect(data.edges).toEqual([]);
  });

  it('GET /api/graph returns workflow representation', async () => {
    const mockWorkflow: Workflow = {
      id: 'wf-1',
      name: 'Mock Workflow',
      tasks: [
        { id: 't1', name: 'Task 1', description: 't1 description', status: 'pending', dependencies: [], acceptanceCriteria: [] },
        { id: 't2', name: 'Task 2', description: 't2 description', status: 'pending', dependencies: ['t1'], acceptanceCriteria: [] }
      ],
      entryPoints: ['t1'],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    server.setWorkflow(mockWorkflow);

    const res = await fetch(`${baseUrl}/api/graph`);
    const data = await res.json();
    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].id).toBe('t1');
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toEqual({ source: 't1', target: 't2' });
  });

  it('GET /api/checkpoints and POST /api/checkpoints/:checkpointId/resume state updates', async () => {
    // Put a dummy checkpoint
    await checkpointer.put({
      threadId: 't-1',
      checkpointId: 'cp-1',
      state: { val: 1 },
      metadata: { source: 'node' },
      createdAt: new Date()
    });

    // List checkpoints
    const res = await fetch(`${baseUrl}/api/checkpoints?threadId=t-1`);
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].checkpointId).toBe('cp-1');

    // Resume/Patch checkpoint state
    const patchRes = await fetch(`${baseUrl}/api/checkpoints/cp-1/resume?threadId=t-1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { val: 42 } })
    });
    const patchData = await patchRes.json();
    expect(patchData.success).toBe(true);

    // Verify state was updated
    const cp = await checkpointer.get('t-1', 'cp-1');
    expect(cp?.state).toEqual({ val: 42 });
  });
});
