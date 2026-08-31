# Multi-Agent Harness - Project Memory

## Project Overview
TypeScript multi-agent orchestration framework with spec-driven development, DAG workflow execution, LLM provider fallback chains, tool calling, SQLite memory, and quality gates.

## Key Patterns Discovered

### Import Structure
- Source files are flat in `src/` (not `src/core/`)
- Test imports must use `../../../src/` not `../../../src/core/`
- Module resolution: NodeNext with `.js` extensions in imports

### Test Infrastructure
- Vitest with single-thread mode (`pool: threads, singleThread: true`) to prevent OOM
- Coverage runs separately in CI to avoid memory pressure
- Node 20/22 matrix in CI

### Key Modules Created/Fixed
- `src/utils/parallel.ts` - parallelMap with concurrency control
- `src/utils/retry.ts` - retry with exponential backoff + onRetry callback
- `src/config/loader.ts` - YAML config loader with defaults
- `src/security/secret-masker.ts` - regex patterns with lookbehind for bearer/password
- `src/monitoring/prometheus.ts` - serialize() uses metric name from key
- `src/task.ts` - TaskQueue.dequeue() marks task as running

### CI Configuration
- Separate `test-coverage` job to avoid memory pressure
- Node 20/22 matrix
- Lint, typecheck, build, test pipeline

### Fallback Chain (Hermes Config)
- Primary: minimax-oauth / MiniMax-M3
- Fallback: nvidia / nvidia/nemotron-3-ultra-550b-a55b
- Swap: 2GB added to prevent OOM kills during test runs

## Known Issues / Quirks
- NVIDIA fallback uses wrong model ID in some cached configs (minimaxai/minimax-m3 vs nvidia/nemotron-3-ultra-550b-a55b)
- Gateway OOM kills when running `npm run test:coverage` without swap + single-thread
- Rate limits: minimax-oauth ~5-15 min reset, NVIDIA free ~1 min rolling

## Skills Available (Hermes Global)
- hermes-agent, llm-provider-fallback, github-repo-management, etc.
- 82 total skills available

## Last Updated
2026-08-29 - All 92 tests passing, CI fixes merged to master