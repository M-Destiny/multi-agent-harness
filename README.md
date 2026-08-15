# Multi-Agent Harness

A TypeScript framework for orchestrating multi-agent workflows with spec-driven development, structured memory, evaluation gates, and tool calling.

## Quick Start

```bash
npm install
npm run build
npx tsx src/cli.ts --help
```

## Key Features

- **Master/Sub-Agent Architecture** — `MasterAgent` coordinates `SubAgent` workers via task delegation
- **DAG Workflow Engine** — Task queues with dependency resolution and parallel execution
- **LLM Provider Abstraction** — OpenAI, Anthropic, OpenRouter with automatic fallback chains
- **Tool Calling** — `ToolCallServer` + `ToolRegistry` for agent tool use with built-in file/terminal tools
- **Memory Stores** — SQLite (persistent, WAL mode) or in-memory, with TTL support
- **Quality Gates** — TypeCheck, Lint, Test, Coverage gates with pass/fail scoring
- **Spec Kit Integration** — CLI wrappers for specify → plan → tasks → implement → verify → converge
- **Event + Metrics** — `EventLogger` and `MetricsCollector` for observability
- **Docker + CI/CD** — Dockerfile, docker-compose, GitHub Actions workflows

## Architecture

```
src/
├── config/          schema.ts (Zod), loader.ts (YAML)
├── core/
│   ├── types.ts     All interfaces: Agent, Task, Workflow, Memory, LLM, etc.
│   ├── agent.ts     BaseAgent abstract class
│   ├── sub-agent.ts SubAgent with LLM calls, tool registration
│   ├── master-agent.ts MasterAgent with delegation, workflow execution
│   ├── task.ts     TaskQueue with dependency resolution
│   ├── workflow.ts  WorkflowExecutor (DAG runner)
│   ├── llm/        openai, anthropic, openrouter, fallback providers
│   ├── memory/      InMemoryStore, SqliteStore (WAL)
│   ├── evaluation/  gates (typecheck/lint/test/coverage), runner, reporters
│   ├── spec-kit/    commands.ts, integration.ts (full SDD loop)
│   ├── tools/       ToolRegistry, ToolCallServer, builtInTools
│   └── monitoring/  EventLogger, MetricsCollector, HealthManager
├── utils/          retry (backoff + jitter), parallelMap (concurrency)
└── cli.ts          Commander CLI: init, run, speckit, config, eval
```

## CLI Commands

```bash
harness init                         Create harness.config.yaml
harness run workflow.json            Execute a workflow
harness config                       Show current config
harness speckit specify <desc>       Run spec→plan→tasks→implement→verify loop
harness eval                         Run typecheck + lint + test gates
```

## Configuration

```yaml
llm:
  primary:
    provider: openai
    model: gpt-4o
    apiKey: ${OPENAI_API_KEY}
    temperature: 0.7
    maxTokens: 2048
    timeoutMs: 30000
  retry:
    maxAttempts: 3
    baseDelayMs: 1000
    factor: 2
    jitter: true
memory:
  type: sqlite
  path: ./.harness/memory.db
agents:
  maxConcurrent: 5
  defaultTimeoutMs: 120000
parallel:
  maxConcurrency: 3
  failFast: false
```

## API Example

```typescript
import { MasterAgent, SubAgent, InMemoryStore, createWorkflow } from './dist/index.js';

const memory = new InMemoryStore();
const master = new MasterAgent({ id: 'm1', name: 'Master', role: 'master',
  capabilities: [], tools: [], memoryNamespace: 'main',
  llmConfig: { provider: 'openai', model: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.7, maxTokens: 2048, timeoutMs: 30000 },
  systemPrompt: '', maxRetries: 3, timeoutMs: 120_000 }, memory);

const sub = new SubAgent({ id: 's1', name: 'Worker', role: 'sub',
  capabilities: ['code'], tools: [], memoryNamespace: 'worker',
  llmConfig: { provider: 'openai', model: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.7, maxTokens: 2048, timeoutMs: 30000 },
  systemPrompt: 'You are a coding assistant.', maxRetries: 3, timeoutMs: 120_000 }, memory);

master.addSubAgent(sub);
await master.initialize();

const wf = createWorkflow({
  id: 'wf1', name: 'Build Feature',
  tasks: [{ id: 't1', name: 'Write code', description: 'Implement feature',
    acceptanceCriteria: [], priority: 'P1', dependencies: [] }]
});

const result = await master.executeWorkflow(wf);
console.log(result.status, result.totalDurationMs);
await master.shutdown();
```

## Testing

```bash
npm test        # vitest
npm run build   # tsc
```

## Contributing

1. Clone and install: `npm install && npm run build`
2. Write tests for any new modules
3. Ensure `npm run build && npx vitest run` passes
4. Submit a PR

## Comparison

| Feature | Harness | LangGraph | AutoGen |
|---|---|---|---|
| TypeScript | ✅ | ❌ | ❌ |
| Spec-driven dev | ✅ (Spec Kit) | ❌ | ❌ |
| Evaluation gates | ✅ | ❌ | ❌ |
| SQLite memory | ✅ | ❌ | ❌ |
| Tool registry | ✅ | partial | partial |
| CLI-first | ✅ | ❌ | ❌ |
