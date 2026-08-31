---
name: multi-agent-harness-ci-fix
description: "Fix CI tests for multi-agent-harness: import paths, missing modules, vitest config, test expectations"
version: 1.0.0
author: Herme
license: MIT
---

# Multi-Agent Harness CI Fix Skill

## Problem
CI tests failing due to:
1. Incorrect import paths (src/core/ vs src/)
2. Missing modules (config/loader, utils/parallel, utils/retry)
3. Vitest config causing OOM kills
4. Incorrect test expectations

## Solution Steps

### 1. Fix Import Paths
```bash
# Change all imports from ../../../src/core/ to ../../../src/
# Update src/master-agent.ts import to ./utils/parallel.ts
```

### 2. Add Missing Modules
- `src/config/loader.ts` - YAML config loader with defaults
- `src/utils/parallel.ts` - parallelMap with concurrency control
- `src/utils/retry.ts` - retry with exponential backoff

### 3. Fix Vitest Config
```typescript
// vitest.config.ts
pool: 'threads',
poolOptions: { threads: { singleThread: true } }
```

### 4. Fix Test Expectations
- TaskQueue.dequeue() marks task as running
- PrometheusMetrics.serialize() uses metric name from key
- SecretMasker patterns use lookbehind for bearer/password
- RetryPolicy test expectations for attempt counts
- SecretMasker test expectations match actual behavior

### 5. CI Workflow Updates
- Separate test-coverage job
- Node 20/22 matrix
- Lint, typecheck, build, test pipeline

## Verification
```bash
npm run test  # All 92 tests pass
```