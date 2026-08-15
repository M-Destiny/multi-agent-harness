# Data Model: Multi-Agent Harness

**Branch**: `001-multi-agent-harness` | **Date**: 2026-08-14

## Core Entities

### Agent
```typescript
interface AgentConfig {
  id: string;
  name: string;
  role: 'master' | 'sub';
  capabilities: string[];        // e.g., ['code', 'research', 'analysis']
  tools: string[];               // Tool identifiers the agent can use
  memoryNamespace: string;       // Isolated memory namespace
  llmConfig: LLMConfig;          // Model, temperature, maxTokens
  systemPrompt: string;          // Base system prompt
  maxRetries: number;            // Retry attempts for LLM calls
  timeoutMs: number;             // Per-call timeout
}
```

### Task
```typescript
interface Task {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];  // Testable conditions
  priority: 'P1' | 'P2' | 'P3';
  dependencies: string[];        // Task IDs that must complete first
  assignedAgentId?: string;      // Agent assigned (optional, for explicit assignment)
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  result?: TaskResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface TaskResult {
  output: unknown;
  evaluation: EvaluationResult;
  artifacts: Artifact[];         // Files, logs, metrics produced
}
```

### Workflow
```typescript
interface Workflow {
  id: string;
  name: string;
  tasks: Task[];                 // All tasks in the workflow
  entryPoints: string[];         // Task IDs with no dependencies
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}
```

### Memory
```typescript
interface MemoryEntry {
  key: string;
  value: unknown;
  namespace: string;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;              // Optional TTL
}

interface MemoryStore {
  get(namespace: string, key: string): Promise<unknown | null>;
  set(namespace: string, key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list(namespace: string, prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
}
```

### LLM Provider
```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

interface LLMProvider {
  config: LLMConfig;
  complete(messages: LLMMessage[]): Promise<LLMResponse>;
  stream(messages: LLMMessage[]): AsyncIterable<LLMChunk>;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
}
```

### Evaluation
```typescript
interface EvaluationResult {
  passed: boolean;
  score: number;                 // 0-100
  checks: CheckResult[];
  summary: string;
}

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
  severity: 'error' | 'warning' | 'info';
}

interface QualityGate {
  name: string;
  run(taskResult: TaskResult): Promise<CheckResult>;
}
```

### Events (Observability)
```typescript
type HarnessEvent =
  | { type: 'task_start'; taskId: string; agentId: string; timestamp: Date }
  | { type: 'task_complete'; taskId: string; agentId: string; result: TaskResult; timestamp: Date }
  | { type: 'task_failed'; taskId: string; agentId: string; error: Error; timestamp: Date }
  | { type: 'agent_spawn'; agentId: string; parentId?: string; timestamp: Date }
  | { type: 'delegation'; fromAgentId: string; toAgentId: string; taskId: string; context: unknown; timestamp: Date }
  | { type: 'llm_call'; agentId: string; provider: string; model: string; tokens: number; latencyMs: number; timestamp: Date }
  | { type: 'provider_fallback'; fromProvider: string; toProvider: string; reason: string; timestamp: Date }
  | { type: 'memory_read'; agentId: string; namespace: string; key: string; timestamp: Date }
  | { type: 'memory_write'; agentId: string; namespace: string; key: string; timestamp: Date };
```

## Relationships

```
Workflow 1 ──< Task >── 1 Agent (assigned)
Task * ──< Dependency >── * Task
Agent 1 ──< MemoryEntry >── * MemoryStore
Agent 1 ──< LLMCall >── * LLMProvider (with fallback chain)
Task 1 ──< EvaluationResult >── * QualityGate
Workflow 1 ──< Event >── * EventLog
```

## Storage Schema (SQLite)

```sql
-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  task_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

-- Workflows
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Memory
CREATE TABLE memory (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  PRIMARY KEY (namespace, key)
);

-- Events (append-only log)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_type ON events(type);
```