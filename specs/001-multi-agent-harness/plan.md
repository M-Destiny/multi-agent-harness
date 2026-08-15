# Implementation Plan: Multi-Agent Harness

**Branch**: `001-multi-agent-harness` | **Date**: 2026-08-14 | **Spec**: specs/001-multi-agent-harness.md

**Input**: Feature specification from `/specs/001-multi-agent-harness/spec.md`

## Summary

Build a TypeScript-based multi-agent harness that orchestrates AI agents through spec-driven development workflows. The harness provides a MasterAgent for coordination, SubAgent abstraction for specialized workers, persistent memory, Spec Kit CLI integration, parallel execution, evaluation gates, and fallback LLM providers.

## Technical Context

**Language/Version**: TypeScript 5.5+ / Node.js 20+

**Primary Dependencies**: 
- `zod` for schema validation
- `better-sqlite3` for persistent memory
- `pino` for structured logging
- `vitest` for testing
- `eslint` + `@typescript-eslint` for linting
- `commander` for CLI
- `yaml` for config

**Storage**: SQLite (better-sqlite3) for memory persistence, JSON for config

**Testing**: Vitest (unit + integration)

**Target Platform**: Linux/macOS/Windows (Node.js CLI)

**Project Type**: CLI library + SDK

**Performance Goals**: 
- Sub-agent spawn < 100ms
- Memory read/write < 10ms
- Parallel 3-agent workflow ≤ 1.5x serial time

**Constraints**: 
- Zero-downtime provider failover < 2s
- Memory persistence 100% fidelity
- All generated code passes `tsc --noEmit` + ESLint

**Scale/Scope**: 
- Support 10+ concurrent agents
- 1000+ tasks in queue
- 10MB+ memory per agent namespace

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [ ] Code quality: TypeScript strict mode, ESLint zero warnings
- [ ] Testing: >80% coverage on core modules
- [ ] Documentation: All public APIs documented
- [ ] Security: No secrets in memory dumps, sanitized logs
- [ ] Performance: Benchmarks in CI

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-agent-harness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── index.ts                    # Public SDK exports
├── cli.ts                      # CLI entry point
├── core/
│   ├── agent.ts                # Agent base class & types
│   ├── master-agent.ts         # MasterAgent implementation
│   ├── sub-agent.ts            # SubAgent implementation
│   ├── task.ts                 # Task queue & types
│   ├── workflow.ts             # Workflow DAG execution
│   ├── memory/
│   │   ├── store.ts            # MemoryStore interface
│   │   ├── sqlite-store.ts     # SQLite implementation
│   │   └── memory-store.ts     # In-memory implementation
│   ├── llm/
│   │   ├── provider.ts         # LLMProvider interface
│   │   ├── openai.ts           # OpenAI provider
│   │   ├── anthropic.ts        # Anthropic provider
│   │   ├── openrouter.ts       # OpenRouter provider
│   │   └── fallback.ts         # Fallback chain
│   ├── spec-kit/
│   │   ├── commands.ts         # Spec Kit CLI wrappers
│   │   └── integration.ts      # Workflow integration
│   ├── evaluation/
│   │   ├── runner.ts           # Evaluation runner
│   │   ├── gates.ts            # Quality gates
│   │   └── reporters.ts        # Result reporters
│   ├── logging/
│   │   └── logger.ts           # Structured logging
│   └── errors/
│       └── harness-errors.ts   # Custom error classes
├── config/
│   └── schema.ts               # Zod config schemas
└── utils/
    ├── retry.ts                # Retry with backoff
    └── parallel.ts             # Parallel execution utils

tests/
├── unit/
│   ├── core/
│   ├── memory/
│   ├── llm/
│   └── evaluation/
├── integration/
│   ├── master-agent.test.ts
│   ├── workflow.test.ts
│   ├── memory-persistence.test.ts
│   └── spec-kit-integration.test.ts
└── fixtures/
    └── sample-agents/
```

**Structure Decision**: Monorepo-style single package with clear core/ separation. CLI and SDK share the same `src/` tree.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Multiple LLM providers | Fallback on rate limits | Single provider fails under load |
| SQLite + in-memory stores | Tests need speed, prod needs persistence | Single store can't optimize both |
| Parallel execution utility | Independent agent throughput | Sequential is 3x slower for 3 agents |
| Spec Kit CLI wrappers | Automate full SDD loop | Manual commands break CI/CD |