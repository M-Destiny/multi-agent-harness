import { z } from 'zod';

export const HarnessConfigSchema = z.object({
  model: z.object({
    default: z.string(),
    provider: z.string(),
    baseUrl: z.string().url(),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    redact: z.boolean().default(true),
  }),
  terminal: z.object({
    backend: z.enum(['local', 'docker']).default('local'),
    workingDir: z.string().default('.'),
    timeout: z.number().default(180),
  }),
  agent: z.object({
    maxTurns: z.number().default(150),
    verbose: z.boolean().default(false),
    reasoningEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  }),
  database: z.object({
    journalMode: z.enum(['wal', 'delete', 'memory']).default('wal'),
  }),
  runtime: z.object({
    nofileSoftLimit: z.number().default(4096),
  }),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;