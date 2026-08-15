// Public SDK exports for the multi-agent harness.

// Core types
export * from './core/types.js';

// Config
export { HarnessConfigSchema, validateHarnessConfig, DEFAULT_CONFIG } from './config/schema.js';
export type { HarnessConfig, LLMConfig, AgentConfig, RetryConfig, ParallelConfig } from './config/schema.js';
export { loadConfig, saveConfig, findConfigFile, createDefaultConfig } from './config/loader.js';

// Errors
export { HarnessError, AgentError, WorkflowError, MemoryError, EvaluationError } from './core/errors/harness-errors.js';

// Logging
export { createLogger } from './core/logging/logger.js';
export type { Logger } from './core/logging/logger.js';

// Memory
export { InMemoryStore } from './core/memory/memory-store.js';
export { SqliteStore } from './core/memory/sqlite-store.js';
export type { MemoryStore, MemorySnapshot } from './core/memory/store.js';

// LLM Providers
export { OpenAIProvider } from './core/llm/openai.js';
export { AnthropicProvider } from './core/llm/anthropic.js';
export { OpenRouterProvider } from './core/llm/openrouter.js';
export { FallbackProvider } from './core/llm/fallback.js';
export { LLMError, FallbackExhaustedError } from './core/llm/provider.js';

// Agents
export { MasterAgent } from './core/master-agent.js';
export { SubAgent } from './core/sub-agent.js';

// Task & Workflow
export { TaskQueue } from './core/task.js';
export { WorkflowExecutor } from './core/workflow.js';

// Spec Kit
export { SpecKitCommands, type CommandResult } from './core/spec-kit/commands.js';
export { SpecKitIntegration } from './core/spec-kit/integration.js';

// Evaluation
export { Evaluator } from './core/evaluation/runner.js';
export { TypeCheckGate, LintGate, TestGate, CoverageGate, createBuiltInGates } from './core/evaluation/gates.js';
export { ConsoleReporter, JsonReporter } from './core/evaluation/reporters.js';
export type { CheckResult, EvaluationResult, QualityGate, TaskResult, Artifact, EvaluatorConfig, EvaluatorResult, GateResult } from './core/evaluation/types.js';

// Utilities
export { retry } from './utils/retry.js';
export type { RetryContext } from './utils/retry.js';
export { parallelMap } from './utils/parallel.js';
