import { MasterAgent, SubAgent, InMemoryStore, createWorkflow, createTask } from '../dist/index.js';

const memory = new InMemoryStore();

// ── Agents ──────────────────────────────────────────────────────────────────

const master = new MasterAgent({
  id: 'master-1',
  name: 'Orchestrator',
  role: 'master',
  capabilities: ['coordination'],
  tools: [],
  memoryNamespace: 'orchestrator',
  llmConfig: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.7,
    maxTokens: 2048,
    timeoutMs: 30000,
  },
  systemPrompt: 'You are a senior software architect coordinating a team of sub-agents.',
  maxRetries: 3,
  timeoutMs: 120_000,
}, memory);

const coder = new SubAgent({
  id: 'coder-1',
  name: 'Coder',
  role: 'sub',
  capabilities: ['coding', 'typescript'],
  tools: ['file_read', 'file_write', 'terminal'],
  memoryNamespace: 'coder',
  llmConfig: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 60000,
  },
  systemPrompt: 'You are an expert TypeScript developer. Write clean, tested code.',
  maxRetries: 2,
  timeoutMs: 120_000,
}, memory);

const reviewer = new SubAgent({
  id: 'reviewer-1',
  name: 'Reviewer',
  role: 'sub',
  capabilities: ['code-review'],
  tools: ['file_read', 'terminal'],
  memoryNamespace: 'reviewer',
  llmConfig: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.3,
    maxTokens: 1024,
    timeoutMs: 30000,
  },
  systemPrompt: 'You are a senior code reviewer. Be thorough but constructive.',
  maxRetries: 2,
  timeoutMs: 60000,
}, memory);

master.addSubAgent(coder);
master.addSubAgent(reviewer);

// ── Workflow ────────────────────────────────────────────────────────────────

const workflow = createWorkflow({
  id: 'wf-feature-x',
  name: 'Build Feature X',
  tasks: [
    createTask({
      id: 't1',
      name: 'Write code',
      description: 'Implement feature X as a TypeScript module',
      acceptanceCriteria: ['Compiles without errors', 'Has unit tests', 'Exports clear API'],
      priority: 'P1',
      dependencies: [],
    }),
    createTask({
      id: 't2',
      name: 'Review code',
      description: 'Review the implementation for correctness and style',
      acceptanceCriteria: ['No critical issues', 'Style guide followed'],
      priority: 'P1',
      dependencies: ['t1'],
    }),
    createTask({
      id: 't3',
      name: 'Fix issues',
      description: 'Address all review feedback',
      acceptanceCriteria: ['Reviewer approved'],
      priority: 'P2',
      dependencies: ['t2'],
    }),
  ],
});

async function main() {
  console.log('Initializing agents...');
  await master.initialize();

  console.log('Running workflow:', workflow.name);
  const result = await master.executeWorkflow(workflow);

  console.log('\n=== Workflow Result ===');
  console.log('Status:', result.status);
  console.log('Duration:', result.totalDurationMs, 'ms');
  console.log('Tasks:', result.tasks.length);
  for (const tr of result.tasks) {
    console.log(`  ${tr.taskId}: ${tr.status} (${tr.durationMs ?? 0}ms) - ${tr.output ?? tr.error ?? ''}`);
  }

  await master.shutdown();
  process.exit(result.status === 'completed' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
