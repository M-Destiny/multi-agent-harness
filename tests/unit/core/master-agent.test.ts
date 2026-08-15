import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubAgent } from '../../../src/core/sub-agent.js';
import { MasterAgent } from '../../../src/core/master-agent.js';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import { createTask, createWorkflow } from '../../../src/core/types.js';
import type { AgentConfig, LLMProvider } from '../../../src/core/types.js';

const mockLLMConfig = {
  provider: 'openai' as const,
  model: 'gpt-4o',
  apiKey: 'test',
  temperature: 0.7,
  maxTokens: 2048,
  timeoutMs: 30000,
};

function makeMockProvider(): LLMProvider {
  return {
    name: 'mock',
    models: ['gpt-4o'],
    config: mockLLMConfig,
    complete: vi.fn().mockResolvedValue({
      content: 'hello',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'gpt-4o',
    }),
    stream: async function* () { yield { content: 'hi', done: false }; yield { content: '', done: true }; },
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 5, lastChecked: new Date() }),
    getUsage: vi.fn().mockResolvedValue({ totalRequests: 1, totalTokens: 15, totalCostUsd: 0, errors: 0, byModel: {} }),
  };
}

function makeAgentConfig(role: 'master' | 'sub', id: string): AgentConfig {
  return {
    id,
    name: id,
    role,
    capabilities: [],
    tools: [] as string[],
    memoryNamespace: 'test',
    llmConfig: mockLLMConfig,
    systemPrompt: '',
    maxRetries: 3,
    timeoutMs: 30000,
  };
}

describe('SubAgent', () => {
  let store: InMemoryStore;
  beforeEach(() => { store = new InMemoryStore(); vi.clearAllMocks(); });

  it('initializes and emits event', async () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    let spawned = false;
    agent.on('agent_spawn', () => { spawned = true; });
    await agent.initialize();
    expect(spawned).toBe(true);
  });

  it('canHandle returns true when no explicit assignment', () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    const task = createTask({ id: 't1', name: 'T', description: 'd', dependencies: [] });
    expect(agent.canHandle(task)).toBe(true);
  });

  it('rejects task with mismatched assignment', () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    const task = createTask({ id: 't1', name: 'T', description: 'd', dependencies: [], assignedAgentId: 'other-agent' });
    expect(agent.canHandle(task)).toBe(false);
  });

  it('executes a task and returns result', async () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    await agent.initialize();
    const task = createTask({ id: 't1', name: 'T', description: 'd', acceptanceCriteria: [], dependencies: [] });
    const result = await agent.execute(task);
    expect(result.output).toBe('hello');
  });

  it('registers and calls a tool', async () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    agent.registerTool('echo', async (args) => ({ success: true, output: JSON.stringify(args) }));
    const result = await agent.callTool('echo', { msg: 'hi' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('{"msg":"hi"}');
  });

  it('returns error for unknown tool', async () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    const result = await agent.callTool('nonexistent', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('shutdown clears initialized flag', async () => {
    const provider = makeMockProvider();
    const agent = new SubAgent(makeAgentConfig('sub', 'a1'), store, provider);
    await agent.initialize();
    await agent.shutdown();
    let spawned = false;
    agent.on('agent_spawn', () => { spawned = true; });
    // after shutdown re-init should re-emit
    await agent.initialize();
    expect(spawned).toBe(true);
  });
});

describe('MasterAgent', () => {
  let store: InMemoryStore;
  beforeEach(() => { store = new InMemoryStore(); vi.clearAllMocks(); });

  it('initializes and adds sub-agents', async () => {
    const master = new MasterAgent(makeAgentConfig('master', 'm1'), store);
    const subProvider = makeMockProvider();
    const sub = new SubAgent(makeAgentConfig('sub', 's1'), store, subProvider);
    master.addSubAgent(sub);
    await master.initialize();
    expect(master.subAgents).toHaveLength(1);
  });

  it('emits delegation events when executing workflow', async () => {
    const master = new MasterAgent(makeAgentConfig('master', 'm1'), store);
    const subProvider = makeMockProvider();
    const sub = new SubAgent(makeAgentConfig('sub', 's1'), store, subProvider);
    master.addSubAgent(sub);
    await master.initialize();

    const delegations: unknown[] = [];
    master.on('delegation', (e) => delegations.push(e));

    const wf = createWorkflow({
      id: 'wf1',
      name: 'Test',
      tasks: [createTask({ id: 't1', name: 'T', description: 'd', acceptanceCriteria: [], dependencies: [] })],
    });
    await master.executeWorkflow(wf);

    expect(delegations.length).toBeGreaterThan(0);
  });

  it('completes empty workflow', async () => {
    const master = new MasterAgent(makeAgentConfig('master', 'm1'), store);
    const wf = createWorkflow({ id: 'wf1', name: 'Empty', tasks: [] });
    const result = await master.executeWorkflow(wf);
    expect(result.status).toBe('completed');
  });
});
