import type { RetryConfig } from '../config/schema.js';

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  error: unknown;
  nextDelayMs: number;
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  config: RetryConfig,
  onRetry?: (ctx: RetryContext) => void | Promise<void>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxAttempts) break;

      const raw = Math.min(config.baseDelayMs * config.factor ** (attempt - 1), config.maxDelayMs);
      const delay = config.jitter ? Math.round(raw * (0.5 + Math.random() * 0.5)) : raw;
      await onRetry?.({ attempt, maxAttempts: config.maxAttempts, error, nextDelayMs: delay });
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
