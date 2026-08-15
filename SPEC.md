# Multi-Agent Harness — Specification

> **Spec Kit: graphify + ponytail development approach**

## 1. Concept & Vision

A TypeScript framework for orchestrating multi-agent AI workflows. Spawn autonomous sub-agents that coordinate via task queues, shared state, and structured output schemas. Designed for complex enterprise tasks that require parallel reasoning, result aggregation, and verifiable outputs.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                MULTI-AGENT HARNESS ARCHITECTURE                  │
│                                                                  │
│                      Master Agent (Herme)                         │
│                            │                                      │
│              ┌─────────────┼─────────────────┐                   │
│              ▼             ▼                 ▼                   │
│        TaskQueue      TaskRouter        ResultAggregator          │
│              │             │                 │                   │
│    ┌─────────┴───┐   ┌─────┴─────┐   ┌───────┴──────┐         │
│    │  Sub-Agent │   │  Sub-Agent│   │  Sub-Agent   │         │
│    │  Worker 1 │   │  Worker 2 │   │  Worker N    │         │
│    └─────────────┘   └───────────┘   └──────────────┘         │
│                                                                  │
│  Shared State (task results, metrics, schema)                    │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Core | Node.js 20, TypeScript 5, ESM |
| Testing | Vitest |
| Logging | Pino |
| Config | Zod |
| Auth | Bearer token validation |

## 4. Core Modules

### `types.ts` — Base Interfaces
```typescript
BaseAgent { id, name, model, provider, maxTokens, temperature }
Task { id, type, payload, status, result?, error?, retryCount }
TaskResult { taskId, output, schemaValid, errors?, metadata }
```

### `task.ts` — TaskQueue (DAG-aware)
- `enqueue(task)` — add task with dependency graph
- `dequeue()` — fetch next ready task
- `complete(taskId, result)` — mark done + unblock dependents
- `fail(taskId, error)` — retry or dead-letter
- `getDAG()` → dependency visualization

### `harness-errors.ts` — Error Classes
- `HarnessError` (base)
- `TaskTimeoutError`, `TaskValidationError`, `SchemaMismatchError`
- `AgentAuthenticationError`, `RateLimitError`, `MaxRetriesExceededError`

### `logger.ts` — Pino Factory
- `createLogger(name, level)` → child logger
- Structured: `{ agentId, taskId, duration, status }`

## 5. Supported Providers (MiniMax preferred)

| Provider | Model |
|---|---|
| MiniMax | `MiniMax-Text-01` (preferred) |
| OpenRouter | Any model via API key |

## 6. Test Coverage

- `tests/unit/task.test.ts` — TaskQueue: enqueue, dequeue, retry, DAG ordering
- `tests/unit/harness-errors.test.ts` — All error classes serialize correctly
- `tests/unit/logger.test.ts` — Log levels, structured fields
- `tests/unit/schema.test.ts` — JSON Schema validation

## 7. Milestones

- [x] Phase 1: Core types, error classes, logger
- [x] Phase 2: Task queue with DAG support
- [x] Phase 3: Master + Sub agent classes
- [x] Phase 4: 54 unit tests passing
- [ ] Phase 5: OpenAPI-compatible REST API
- [ ] Phase 6: WebSocket event streaming
- [ ] Phase 7: Persistence adapter (Redis/Postgres)
