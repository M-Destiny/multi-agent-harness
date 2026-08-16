export interface RetryPolicyOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  exponential?: boolean;
  retryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

export class RetryPolicy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: boolean;
  private readonly exponential: boolean;
  private readonly retryable: (err: unknown) => boolean;
  private readonly onRetry?: (attempt: number, delayMs: number, err: unknown) => void;

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.jitter = options.jitter ?? true;
    this.exponential = options.exponential ?? true;
    this.retryable = options.retryable ?? (() => true);
    this.onRetry = options.onRetry;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt === this.maxAttempts || !this.retryable(err)) {
          throw err;
        }
        const delay = this.calculateDelay(attempt);
        this.onRetry?.(attempt, delay, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.exponential ? this.baseDelayMs * Math.pow(2, attempt - 1) : this.baseDelayMs;
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    if (!this.jitter) return cappedDelay;
    // Full jitter: random between 0 and cappedDelay
    return Math.floor(Math.random() * cappedDelay);
  }
}
