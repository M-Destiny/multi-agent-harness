# Quickstart: Multi-Agent Harness

**Branch**: `001-multi-agent-harness` | **Date**: 2026-08-14

## Prerequisites

- Node.js 20+
- `uv` (for Spec Kit CLI)
- Spec Kit installed: `uv tool install specify-cli`

## Installation

```bash
# Clone and install
cd /root/research-multi-agent-harness
npm install

# Build
npm run build

# Run CLI
npx harness --help
```

## Quick Start: Your First Multi-Agent Workflow

### 1. Define Agents

```typescript
// agents/my-workflow.ts
import { MasterAgent, SubAgent, LLMConfig } from 'multi-agent-harness';

const llmConfig: LLMConfig = {
  provider: 'openrouter',
  model: 'anthropic/claude-3.5-sonnet',
  apiKey: process.env.OPENROUTER_API_KEY!,
  temperature: 0.3,
  maxTokens: 4096,
};

const researcher = new SubAgent({
  id: 'researcher',
  name: 'Research Agent',
  role: 'sub',
  capabilities: ['research', 'analysis'],
  tools: ['web_search', 'read_file'],
  memoryNamespace: 'research',
  llmConfig,
  systemPrompt: 'You are a research specialist. Find accurate, cited information.',
});

const coder = new SubAgent({
  id: 'coder',
  name: 'Code Agent',
  role: 'sub',
  capabilities: ['code', 'debug', 'test'],
  tools: ['read_file', 'write_file', 'terminal'],
  memoryNamespace: 'code',
  llmConfig,
  systemPrompt: 'You are a TypeScript expert. Write clean, tested code.',
});

const master = new MasterAgent({
  id: 'master',
  name: 'Master Agent',
  role: 'master',
  capabilities: ['orchestration', 'planning'],
  tools: [],
  memoryNamespace: 'master',
  llmConfig,
  systemPrompt: 'You coordinate agents to complete complex tasks.',
  subAgents: [researcher, coder],
});
```

### 2. Define a Workflow

```typescript
// workflows/build-feature.ts
import { Workflow, Task } from 'multi-agent-harness';

const workflow = new Workflow({
  id: 'build-login-feature',
  name: 'Build Login Feature',
  tasks: [
    {
      id: 'research-auth',
      name: 'Research Auth Patterns',
      description: 'Research modern auth patterns for TypeScript apps',
      acceptanceCriteria: [
        'Documents at least 3 auth approaches',
        'Includes pros/cons for each',
        'Recommends one with justification'
      ],
      priority: 'P1',
      dependencies: [],
    },
    {
      id: 'design-api',
      name: 'Design Auth API',
      description: 'Design the login/register API endpoints',
      acceptanceCriteria: [
        'Defines request/response types',
        'Includes error handling',
        'Specifies JWT structure'
      ],
      priority: 'P1',
      dependencies: ['research-auth'],
    },
    {
      id: 'implement-auth',
      name: 'Implement Auth Module',
      description: 'Write the authentication module with tests',
      acceptanceCriteria: [
        'All TypeScript compiles',
        'Unit tests pass (>80% coverage)',
        'ESLint passes with zero warnings',
        'Integrates with existing user store'
      ],
      priority: 'P1',
      dependencies: ['design-api'],
    },
    {
      id: 'verify-auth',
      name: 'Verify Implementation',
      description: 'Run full test suite and integration checks',
      acceptanceCriteria: [
        'All tests pass',
        'No TypeScript errors',
        'No ESLint warnings',
        'Manual smoke test passes'
      ],
      priority: 'P1',
      dependencies: ['implement-auth'],
    },
  ],
});
```

### 3. Run the Workflow

```typescript
// run.ts
import { MasterAgent } from 'multi-agent-harness';
import { workflow } from './workflows/build-feature';

async function main() {
  const master = new MasterAgent({ /* config */ });
  
  const result = await master.executeWorkflow(workflow);
  
  console.log('Workflow completed:', result.status);
  console.log('Tasks:', result.taskResults);
}

main().catch(console.error);
```

```bash
npx tsx run.ts
```

## Using Spec Kit Integration

The harness integrates with Spec Kit's SDD loop:

```bash
# 1. Create constitution (project principles)
npx harness speckit constitution "TypeScript, strict mode, test-first, clean architecture"

# 2. Specify a feature
npx harness speckit specify "Build a user authentication system with JWT"

# 3. Generate implementation plan
npx harness speckit plan

# 4. Generate actionable tasks
npx harness speckit tasks

# 5. Implement (runs the multi-agent workflow)
npx harness speckit implement

# 6. Verify (tests, lint, typecheck)
npx harness speckit verify

# 7. Converge (find remaining work)
npx harness speckit converge
```

## Configuration

Create `harness.config.yaml`:

```yaml
llm:
  primary:
    provider: openrouter
    model: anthropic/claude-3.5-sonnet
    apiKey: ${OPENROUTER_API_KEY}
  fallback:
    provider: openai
    model: gpt-4o
    apiKey: ${OPENAI_API_KEY}
  retry:
    maxAttempts: 3
    baseDelayMs: 1000
    maxDelayMs: 30000

memory:
  type: sqlite
  path: ./.harness/memory.db

logging:
  level: info
  format: json
  output: ./.harness/logs/

agents:
  maxConcurrent: 5
  defaultTimeoutMs: 120000

specKit:
  cliPath: specify
  projectRoot: .
```

## Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# With coverage
npm run test:coverage
```

## Project Structure After Init

```
my-project/
├── src/
│   ├── agents/           # Your agent definitions
│   ├── workflows/        # Your workflow definitions
│   └── run.ts           # Entry point
├── specs/               # Spec Kit specifications
├── .harness/            # Memory, logs, cache
├── harness.config.yaml  # Configuration
├── package.json
└── tsconfig.json
```

## Next Steps

1. Read the [full specification](specs/001-multi-agent-harness.md)
2. Explore [data model](specs/001-multi-agent-harness/data-model.md)
3. Check [implementation plan](specs/001-multi-agent-harness/plan.md)
4. Run the example workflow above
5. Define your own agents and workflows