// Core types for the multi-agent harness — single source of truth.

import type { MemoryStore, MemorySnapshot } from './memory/store.js';
export type { MemoryStore, MemorySnapshot };

// ── Enums ───────────────────────────────────────────────────────────────────

export type AgentRole = 'master' | 'sub';
export type TaskPriority = 'P1' | 'P2' | 'P3';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';
export type LLMProviderType = 'openai' | 'anthropic' | 'openrouter';

// ── LLM Types ───────────────────────────────────────────────────────────────

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
}

export interface LLMChunk {
  content: string;
  toolCalls?: ToolCall[];
  done: boolean;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; name: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly models: ReadonlyArray<string>;
  readonly config: LLMConfig;
  complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse>;
  stream(messages: LLMMessage[], options?: CompletionOptions): AsyncIterable<LLMChunk>;
  healthCheck(): Promise<HealthStatus>;
  getUsage(): Promise<UsageStats>;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  error?: string;
  lastChecked: Date;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  errors: number;
  byModel: Record<string, { requests: number; tokens: number }>;
}

// ── Task & Workflow ─────────────────────────────────────────────────────────

export interface TaskResult {
  output: unknown;
  evaluation?: EvaluationResult;
  artifacts: Artifact[];
}

export interface Artifact {
  type: string;
  name: string;
  path?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

export interface EvaluationResult {
  passed: boolean;
  score: number;
  checks: CheckResult[];
  summary: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
  severity: 'error' | 'warning' | 'info';
}

export interface Task {
  id: string;
  name: string;
  description: string;
  acceptanceCriteria: string[];
  priority: TaskPriority;
  dependencies: string[];
  assignedAgentId?: string;
  status: TaskStatus;
  result?: TaskResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Workflow {
  id: string;
  name: string;
  tasks: Task[];
  entryPoints: string[];
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowResult {
  workflowId: string;
  status: WorkflowStatus;
  taskResults: Map<string, TaskResult>;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs: number;
}

export interface TaskContext {
  workflowId: string;
  parentTaskId?: string;
  sharedMemory: Record<string, unknown>;
  variables: Record<string, unknown>;
}

// ── Agent Messages & Events ─────────────────────────────────────────────────

export interface AgentMessage {
  type: 'instruction' | 'query' | 'result' | 'error';
  payload: unknown;
  fromAgentId: string;
  toAgentId?: string;
  timestamp: Date;
}

export type HarnessEvent =
  | { type: 'task_start'; taskId: string; agentId: string; timestamp: Date }
  | { type: 'task_complete'; taskId: string; agentId: string; result: TaskResult; timestamp: Date }
  | { type: 'task_failed'; taskId: string; agentId: string; error: Error; timestamp: Date }
  | { type: 'agent_spawn'; agentId: string; parentId?: string; timestamp: Date }
  | { type: 'delegation'; fromAgentId: string; toAgentId: string; taskId: string; context: unknown; timestamp: Date }
  | { type: 'llm_call'; agentId: string; provider: string; model: string; tokens: number; latencyMs: number; timestamp: Date }
  | { type: 'provider_fallback'; fromProvider: string; toProvider: string; reason: string; timestamp: Date }
  | { type: 'memory_read'; agentId: string; namespace: string; key: string; timestamp: Date }
  | { type: 'memory_write'; agentId: string; namespace: string; key: string; timestamp: Date };

export type EventHandler = (event: HarnessEvent) => void | Promise<void>;

// ── Agent Config ────────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
  tools: string[];
  memoryNamespace: string;
  llmConfig: LLMConfig;
  systemPrompt: string;
  maxRetries: number;
  timeoutMs: number;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

// ── BaseAgent ──────────────────────────────────────────────────────────────

export abstract class BaseAgent {
  protected readonly _config: AgentConfig;
  protected readonly _memory: MemoryStore;
  protected readonly handlers = new Map<string, Set<EventHandler>>();
  protected initialized = false;

  constructor(config: AgentConfig, memoryStore: MemoryStore) {
    this._config = config;
    this._memory = memoryStore;
  }

  get id(): string { return this._config.id; }
  get name(): string { return this._config.name; }
  get role(): AgentRole { return this._config.role; }
  get capabilities(): readonly string[] { return this._config.capabilities; }
  get tools(): readonly string[] { return this._config.tools; }
  get memoryNamespace(): string { return this._config.memoryNamespace; }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;

  on(event: HarnessEvent['type'], handler: EventHandler): void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(handler);
  }

  off(event: HarnessEvent['type'], handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: HarnessEvent): void {
    const set = this.handlers.get(event.type);
    if (set) for (const h of Array.from(set)) try { h(event); } catch { /* swallow */ }
  }

  async getMemory(key: string): Promise<unknown | null> {
    const val = await this._memory.get(this._config.memoryNamespace, key);
    this.emit({ type: 'memory_read', agentId: this._config.id, namespace: this._config.memoryNamespace, key, timestamp: new Date() });
    return val;
  }

  async setMemory(key: string, value: unknown, ttlMs?: number): Promise<void> {
    await this._memory.set(this._config.memoryNamespace, key, value, ttlMs);
    this.emit({ type: 'memory_write', agentId: this._config.id, namespace: this._config.memoryNamespace, key, timestamp: new Date() });
  }
}

// ── Checkpointer (Durable Execution) ────────────────────────────────────────

export interface CheckpointMetadata {
  step: number;
  timestamp: Date;
  node?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Checkpoint {
  threadId: string;
  checkpointId: string;
  parentCheckpointId?: string;
  state: unknown;
  metadata: CheckpointMetadata;
  createdAt: Date;
}

export interface Checkpointer {
  get(threadId: string, checkpointId?: string): Promise<Checkpoint | null>;
  put(checkpoint: Checkpoint): Promise<void>;
  list(threadId: string): Promise<Checkpoint[]>;
  delete(threadId: string): Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function createTask(partial: Partial<Task> & { id: string; name: string; description: string }): Task {
  return {
    id: partial.id,
    name: partial.name,
    description: partial.description,
    acceptanceCriteria: partial.acceptanceCriteria ?? [],
    priority: partial.priority ?? 'P2',
    dependencies: partial.dependencies ?? [],
    assignedAgentId: partial.assignedAgentId,
    status: partial.status ?? 'pending',
    result: partial.result,
    createdAt: partial.createdAt ?? new Date(),
    startedAt: partial.startedAt,
    completedAt: partial.completedAt,
  };
}

export function createWorkflow(partial: Partial<Workflow> & { id: string; name: string; tasks: Task[] }): Workflow {
  const now = new Date();
  const entryPoints = partial.tasks.filter((t) => t.dependencies.length === 0).map((t) => t.id);
  return {
    id: partial.id,
    name: partial.name,
    tasks: partial.tasks,
    entryPoints: partial.entryPoints ?? entryPoints,
    status: partial.status ?? 'pending',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}
