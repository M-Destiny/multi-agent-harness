import type { CompletionOptions, HealthStatus, LLMChunk, LLMConfig, LLMMessage, LLMProvider, LLMResponse, UsageStats } from '../types.js';

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly statusCode?: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LLMError';
  }

  get recoverable(): boolean {
    return this.statusCode ? this.statusCode >= 500 || this.statusCode === 429 : true;
  }
}

export class FallbackExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attemptedProviders: string[],
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'FallbackExhaustedError';
  }
}

export type { CompletionOptions, HealthStatus, LLMChunk, LLMConfig, LLMMessage, LLMProvider, LLMResponse, UsageStats };
