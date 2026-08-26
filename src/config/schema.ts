import { z } from 'zod';

// ── LLM Config ──────────────────────────────────────────────────────────────

export const LLMConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().default(4096),
  timeoutMs: z.number().int().positive().default(60_000),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ── Sandbox Config ──────────────────────────────────────────────────────────

export const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['docker', 'e2b', 'modal']).default('docker'),
  cpuLimit: z.number().min(0).optional(),
  memoryLimitMb: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(60_000),
  networkAllowed: z.boolean().default(false),
  image: z.string().optional(),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

// ── Agent Config ────────────────────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['master', 'sub']),
  capabilities: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  memoryNamespace: z.string().min(1),
  llmConfig: LLMConfigSchema,
  systemPrompt: z.string().default(''),
  maxRetries: z.number().int().min(0).default(3),
  timeoutMs: z.number().int().positive().default(120_000),
  sandbox: SandboxConfigSchema.optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ── Memory Config ──────────────────────────────────────────────────────────

export const MemoryConfigSchema = z.object({
  type: z.enum(['sqlite', 'memory']).default('sqlite'),
  path: z.string().default('./.harness/memory.db'),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// ── Logging Config ──────────────────────────────────────────────────────────

export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  pretty: z.boolean().default(false),
  redact: z.array(z.string()).default(['apiKey', 'token', 'authorization', 'password']),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// ── Retry Config ────────────────────────────────────────────────────────────

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).default(3),
  baseDelayMs: z.number().int().min(0).default(500),
  maxDelayMs: z.number().int().min(0).default(30_000),
  factor: z.number().min(1).default(2),
  jitter: z.boolean().default(true),
});
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

// ── Parallel Config ─────────────────────────────────────────────────────────

export const ParallelConfigSchema = z.object({
  maxConcurrency: z.number().int().min(1).default(3),
  failFast: z.boolean().default(false),
});
export type ParallelConfig = z.infer<typeof ParallelConfigSchema>;

// ── Evaluation Config ───────────────────────────────────────────────────────

export const EvaluationConfigSchema = z.object({
  runTests: z.boolean().default(true),
  runLint: z.boolean().default(true),
  runTypecheck: z.boolean().default(true),
  runCoverage: z.boolean().default(false),
});
export type EvaluationConfig = z.infer<typeof EvaluationConfigSchema>;

// ── Spec Kit Config ─────────────────────────────────────────────────────────

export const SpecKitConfigSchema = z.object({
  cliPath: z.string().default('specify'),
  projectRoot: z.string().default('.'),
  timeoutMs: z.number().int().positive().default(600_000),
});
export type SpecKitConfig = z.infer<typeof SpecKitConfigSchema>;

// ── Observability Config ────────────────────────────────────────────────────

export const ObservabilityConfigSchema = z.object({
  otel: z.object({
    enabled: z.boolean().default(false),
    serviceName: z.string().default('multi-agent-harness'),
    exporter: z.enum(['grpc', 'http', 'console']).default('http'),
    endpoint: z.string().url().optional(),
  }).default({}),
});
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;



// ── Root Harness Config ─────────────────────────────────────────────────────

export const HarnessConfigSchema = z.object({
  name: z.string().default('multi-agent-harness'),
  version: z.string().default('0.1.0'),
  llm: z.object({
    primary: LLMConfigSchema.optional(),
    fallback: LLMConfigSchema.optional(),
    retry: RetryConfigSchema.default({}),
  }).default({}),
  memory: MemoryConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  observability: ObservabilityConfigSchema.default({}),
  sandbox: SandboxConfigSchema.default({}),
  agents: z.object({
    maxConcurrent: z.number().int().min(1).default(5),
    defaultTimeoutMs: z.number().int().positive().default(120_000),
  }).default({}),
  evaluation: EvaluationConfigSchema.default({}),
  specKit: SpecKitConfigSchema.default({}),
  parallel: ParallelConfigSchema.default({}),
});
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export const DEFAULT_CONFIG: HarnessConfig = HarnessConfigSchema.parse({});

export function validateHarnessConfig(config: unknown): HarnessConfig {
  return HarnessConfigSchema.parse(config);
}
