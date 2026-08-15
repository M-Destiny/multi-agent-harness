# Contributing to Multi-Agent Harness

Thank you for contributing! Here's everything you need to get started.

## Development Setup

```bash
git clone https://github.com/M-Destiny/multi-agent-harness.git
cd multi-agent-harness
npm install
npm run build
```

## Workflow

```bash
# Make changes on a feature branch
git checkout -b feature/my-feature

# Run tests (must pass)
npx vitest run

# Type-check (must pass)
npm run build

# Lint
npm run lint

# Commit (use conventional commits)
git commit -m "feat(memory): add TTL support to SqliteStore"
```

## Project Structure

```
src/
├── config/          Schema (Zod) and YAML loader
├── core/
│   ├── types.ts     All TypeScript interfaces
│   ├── agent.ts     BaseAgent abstract
│   ├── sub-agent.ts SubAgent (LLM calls, tools)
│   ├── master-agent.ts MasterAgent (delegation, workflow)
│   ├── task.ts      TaskQueue (DAG dependency resolution)
│   ├── workflow.ts  WorkflowExecutor
│   ├── llm/         OpenAI, Anthropic, OpenRouter, Fallback
│   ├── memory/      InMemory, Sqlite (WAL)
│   ├── evaluation/  Quality gates (typecheck/lint/test/coverage)
│   ├── spec-kit/    Spec Kit SDD integration
│   ├── tools/       Tool registry + tool-call-server
│   ├── monitoring/  EventLogger, Prometheus, Health API
│   ├── resilience/  CircuitBreaker, RateLimiter, RetryPolicy
│   └── security/   AuditLogger, SecretMasker, InputSanitizer
└── utils/          retry, parallelMap
```

## Adding an LLM Provider

1. Create `src/core/llm/<provider>.ts`
2. Implement `LLMProvider` interface
3. Export from `src/core/llm/index.ts`
4. Add to `createLLMProvider` in `provider.ts`

```typescript
// src/core/llm/myprovider.ts
export function createMyProvider(config: LLMConfig): LLMProvider {
  return {
    name: 'myprovider',
    models: [config.model],
    config,
    complete: async ({ messages, model }) => { /* ... */ },
    stream: async function* ({ messages, model }) { /* ... */ },
    healthCheck: async () => ({ healthy: true, latencyMs: 0, lastChecked: new Date() }),
    getUsage: async () => ({ totalRequests: 0, totalTokens: 0, totalCostUsd: 0, errors: 0, byModel: {} }),
    destroy: () => {},
  };
}
```

## Adding a Quality Gate

1. Implement `QualityGate` interface in `src/core/evaluation/gates.ts`
2. Add test in `tests/unit/evaluation/`

```typescript
export class MyGate implements QualityGate {
  override async evaluate(taskResult: TaskResult): Promise<CheckResult> {
    return {
      passed: true,
      score: 100,
      details: 'Custom gate passed',
      durationMs: 0,
    };
  }
}
```

## Commit Conventions

| Type | Description |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructure (no behavior change) |
| `test:` | Adding or updating tests |
| `docs:` | Documentation only |
| `perf:` | Performance improvement |
| `enterprise:` | Enterprise feature |

Example: `feat(llm): add OpenRouter provider with streaming support`

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Specific file
npx vitest run tests/unit/core/task.test.ts
```

## Code Review Checklist

- [ ] `npm run build` passes
- [ ] `npx vitest run` passes (all tests)
- [ ] New modules have corresponding tests
- [ ] No `any` types introduced (use proper generics)
- [ ] Error handling for all async operations
- [ ] JSDoc on public APIs
