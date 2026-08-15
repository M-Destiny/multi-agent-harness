export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface TokenBucketOptions {
  tokens: number;
  intervalMs: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill = Date.now();
  private readonly capacity: number;
  private readonly intervalMs: number;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.tokens;
    this.tokens = options.tokens;
    this.intervalMs = options.intervalMs;
  }

  acquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  async acquireAsync(): Promise<void> {
    while (!this.acquire()) {
      await new Promise((r) => setTimeout(r, Math.min(this.getWaitTime(), 100)));
    }
  }

  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    const deficit = 1 - this.tokens;
    return Math.ceil(deficit * this.intervalMs);
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.acquire()) {
      throw new RateLimitError(`Rate limited — retry after ${this.getWaitTime()}ms`, this.getWaitTime());
    }
    return fn();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillCount = Math.floor(elapsed / this.intervalMs) * this.capacity;
    if (refillCount > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refillCount);
      this.lastRefill = now;
    }
  }
}
