# Agent Contract

**Version**: 1.0.0

## MasterAgent Interface

```typescript
interface MasterAgent {
  readonly id: string;
  readonly name: string;
  readonly subAgents: ReadonlyArray<SubAgent>;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Workflow execution
  executeWorkflow(workflow: Workflow): Promise<WorkflowResult>;
  executeTask(task: Task, context?: TaskContext): Promise<TaskResult>;
  
  // Delegation
  delegate(task: Task, toAgent: SubAgent, context: TaskContext): Promise<TaskResult>;
  broadcast(message: AgentMessage, targets?: SubAgent[]): Promise<void>;
  
  // Memory
  getMemory(namespace: string, key: string): Promise<unknown | null>;
  setMemory(namespace: string, key: string, value: unknown): Promise<void>;
  
  // Events
  on(event: 'task_start' | 'task_complete' | 'task_failed' | 'delegation', handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}

interface WorkflowResult {
  workflowId: string;
  status: 'completed' | 'failed' | 'partial';
  taskResults: Map<string, TaskResult>;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs: number;
}

interface TaskContext {
  workflowId: string;
  parentTaskId?: string;
  sharedMemory: Record<string, unknown>;
  variables: Record<string, unknown>;
}

interface AgentMessage {
  type: 'instruction' | 'query' | 'result' | 'error';
  payload: unknown;
  fromAgentId: string;
  toAgentId?: string;  // undefined = broadcast
  timestamp: Date;
}
```

## SubAgent Interface

```typescript
interface SubAgent {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly tools: ReadonlyArray<string>;
  readonly memoryNamespace: string;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Execution
  execute(task: Task, context: TaskContext): Promise<TaskResult>;
  canHandle(task: Task): boolean;  // Capability matching
  
  // Memory (isolated to namespace)
  getMemory(key: string): Promise<unknown | null>;
  setMemory(key: string, value: unknown): Promise<void>;
  
  // LLM
  complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse>;
  stream(prompt: string, options?: CompletionOptions): AsyncIterable<LLMChunk>;
  
  // Tools
  callTool(toolName: string, args: unknown): Promise<ToolResult>;
  availableTools(): ReadonlyArray<ToolDefinition>;
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; name: string };
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}
```

## TaskQueue Interface

```typescript
interface TaskQueue {
  enqueue(task: Task): Promise<void>;
  dequeue(agentId: string): Promise<Task | null>;  // Returns next eligible task
  requeue(taskId: string): Promise<void>;
  complete(taskId: string, result: TaskResult): Promise<void>;
  fail(taskId: string, error: Error): Promise<void>;
  getStatus(taskId: string): Promise<TaskStatus>;
  getPending(agentId?: string): Promise<Task[]>;
  getBlocked(agentId?: string): Promise<Task[]>;
}

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
```

## MemoryStore Interface

```typescript
interface MemoryStore {
  // Basic operations
  get(namespace: string, key: string): Promise<unknown | null>;
  set(namespace: string, key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  exists(namespace: string, key: string): Promise<boolean>;
  
  // Batch operations
  getMany(namespace: string, keys: string[]): Promise<Map<string, unknown>>;
  setMany(namespace: string, entries: Map<string, unknown>, ttlMs?: number): Promise<void>;
  deleteMany(namespace: string, keys: string[]): Promise<void>;
  
  // Query
  listKeys(namespace: string, prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
  size(namespace: string): Promise<number>;
  
  // Persistence
  snapshot(): Promise<MemorySnapshot>;
  restore(snapshot: MemorySnapshot): Promise<void>;
}

interface MemorySnapshot {
  timestamp: Date;
  namespaces: Record<string, Record<string, { value: unknown; expiresAt?: number }>>;
}
```

## LLMProvider Interface

```typescript
interface LLMProvider {
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly config: LLMConfig;
  
  // Core completion
  complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse>;
  stream(messages: LLMMessage[], options?: CompletionOptions): AsyncIterable<LLMChunk>;
  
  // Health
  healthCheck(): Promise<HealthStatus>;
  getUsage(): Promise<UsageStats>;
}

interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  lastChecked: Date;
}

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  errors: number;
  byModel: Record<string, { requests: number; tokens: number }>;
}
```

## Evaluation Interface

```typescript
interface Evaluator {
  evaluate(task: Task, result: TaskResult): Promise<EvaluationResult>;
  registerGate(gate: QualityGate): void;
  unregisterGate(name: string): void;
  listGates(): QualityGate[];
}

interface QualityGate {
  name: string;
  description: string;
  run(task: Task, result: TaskResult): Promise<CheckResult>;
  blocking: boolean;  // If true, failure blocks task completion
}

interface CheckResult {
  gate: string;
  passed: boolean;
  score: number;  // 0-100
  details: string;
  severity: 'error' | 'warning' | 'info';
  artifacts?: Artifact[];
}
```

## SpecKitIntegration Interface

```typescript
interface SpecKitIntegration {
  // Constitution
  createConstitution(principles: string): Promise<ConstitutionResult>;
  
  // Specify
  specifyFeature(description: string): Promise<SpecResult>;
  
  // Plan
  generatePlan(specPath: string): Promise<PlanResult>;
  
  // Tasks
  generateTasks(planPath: string): Promise<TasksResult>;
  
  // Implement
  implement(tasksPath: string, options?: ImplementOptions): Promise<ImplementResult>;
  
  // Verify
  verify(options?: VerifyOptions): Promise<VerifyResult>;
  
  // Converge
  converge(): Promise<ConvergeResult>;
}

interface ImplementOptions {
  agents?: SubAgent[];
  maxParallel?: number;
  dryRun?: boolean;
  approvalRequired?: boolean;
}

interface VerifyOptions {
  runTests: boolean;
  runLint: boolean;
  runTypecheck: boolean;
  runBenchmarks: boolean;
  coverageThreshold?: number;
}
```

## Error Types

```typescript
class HarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HarnessError';
  }
}

class AgentError extends HarnessError {
  constructor(message: string, public readonly agentId: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', true, context);
    this.name = 'AgentError';
  }
}

class LLMError extends HarnessError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    const recoverable = statusCode ? statusCode >= 500 || statusCode === 429 : true;
    super(message, 'LLM_ERROR', recoverable, context);
    this.name = 'LLMError';
  }
}

class MemoryError extends HarnessError {
  constructor(message: string, public readonly namespace: string, context?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', false, context);
    this.name = 'MemoryError';
  }
}

class WorkflowError extends HarnessError {
  constructor(message: string, public readonly workflowId: string, public readonly taskId?: string, context?: Record<string, unknown>) {
    super(message, 'WORKFLOW_ERROR', false, context);
    this.name = 'WorkflowError';
  }
}
```