import { z } from 'zod';

export const ModelProviderSchema = z.enum(['minimax', 'openrouter']);
export const TaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'dead']);
export const TaskTypeSchema = z.enum(['reasoning', 'coding', 'research', 'aggregation']);

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  model: z.string().default('MiniMax-Text-01'),
  provider: ModelProviderSchema.default('minimax'),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  timeoutMs: z.number().int().positive().default(30000),
});

export const TaskPayloadSchema = z.object({
  goal: z.string(),
  context: z.string().optional(),
  outputSchema: z.record(z.any()).optional(),
});

export const TaskSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  payload: TaskPayloadSchema,
  status: TaskStatusSchema.default('pending'),
  result: z.any().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(3),
  dependsOn: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const TaskResultSchema = z.object({
  taskId: z.string(),
  output: z.any(),
  schemaValid: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type ModelProvider = z.infer<typeof ModelProviderSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type TaskPayload = z.infer<typeof TaskPayloadSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
