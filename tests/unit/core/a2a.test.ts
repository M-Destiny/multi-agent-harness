import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MasterAgent } from '../../../src/core/master-agent.js';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import { createTask } from '../../../src/core/types.js';
import type { AgentConfig } from '../../../src/core/types.js';
import { createA2AClient } from '../../../src/core/a2a/client.js';

const mockAgentConfig: AgentConfig = {
  id: 'master-1',
  name: 'Master Agent',
  role: 'master',
  capabilities: [],
  tools: [],
  memoryNamespace: 'test',
  llmConfig: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'test',
    temperature: 0.7,
    maxTokens: 1000,
    timeoutMs: 30000,
  },
  systemPrompt: '',
  maxRetries: 3,
  timeoutMs: 30000,
};

describe('A2A Integration', () => {
  let store: InMemoryStore;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    store = new InMemoryStore();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('A2AClient discovers agent card', async () => {
    const mockCard = {
      name: 'remote-agent',
      description: 'A test remote agent',
      version: '1.0.0',
      url: 'http://localhost:8080',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      skills: [],
      authentication: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCard,
    } as Response);

    const client = createA2AClient({ baseUrl: 'http://localhost:8080' });
    const card = await client.discover();

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:8080/.well-known/agent.json', expect.any(Object));
    expect(card).toEqual(mockCard);
  });

  it('MasterAgent delegates to external agent via A2A client', async () => {
    const mockCard = {
      name: 'remote-agent',
      description: 'A test remote agent',
      version: '1.0.0',
      url: 'http://localhost:8080',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      skills: [],
      authentication: [],
    };

    const mockTaskResponse = {
      id: 'task-123',
      contextId: 'ctx-123',
      status: 'completed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Resolved task successfully' }],
      },
      artifacts: [{ name: 'result-file', parts: [{ type: 'text', text: 'file content' }] }],
    };

    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCallCount++;
      if (url.endsWith('/.well-known/agent.json')) {
        return {
          ok: true,
          json: async () => mockCard,
        } as Response;
      }
      if (url.endsWith('/tasks')) {
        return {
          ok: true,
          json: async () => mockTaskResponse,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const master = new MasterAgent(mockAgentConfig, store);
    await master.initialize();

    const task = createTask({
      id: 't1',
      name: 'Test Task',
      description: 'Run A2A delegation test',
      input: 'Please resolve this task',
      dependencies: [],
    });

    const result = await master.delegateToA2A('http://localhost:8080', task);

    expect(result.output).toBe('Resolved task successfully');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].name).toBe('result-file');
    expect(result.artifacts[0].content).toBe('file content');
  });
});
