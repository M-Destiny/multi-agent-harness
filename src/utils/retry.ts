export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface RetryContext {
  attempt: number;
  error: Error;
  delayMs: number;
}

export type OnRetryCallback = (context: RetryContext) => void;

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  onRetry?: OnRetryCallback
): Promise<T> {
  const { maxAttempts, baseDelayMs, factor, maxDelayMs, jitter } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      if (onRetry) {
        const delayMs = Math.min(
          baseDelayMs * Math.pow(factor, attempt - 1),
          maxDelayMs
        );
        const finalDelay = jitter ? delayMs * (0.5 + Math.random() * 0.5) : delayMs;
        onRetry({ attempt, error: lastError, delayMs: Math.floor(finalDelay) });
      }
      
      const delayMs = Math.min(
        baseDelayMs * Math.pow(factor, attempt - 1),
        maxDelayMs
      );
      const finalDelay = jitter ? delayMs * (0.5 + Math.random() * 0.5) : delayMs;
      
      await new Promise((resolve) => setTimeout(resolve, finalDelay));
    }
  }
  
  throw lastError!;
}