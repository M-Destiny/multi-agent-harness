export enum CircuitState { CLOSED = 'CLOSED', OPEN = 'OPEN', HALF_OPEN = 'HALF_OPEN' }

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  onStateChange?: (state: CircuitState) => void;
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: (state: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.onStateChange = options.onStateChange;
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transition(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN — failing fast');
    }
    try {
      const result = await fn();
      if (this.state === CircuitState.HALF_OPEN) {
        this.transition(CircuitState.CLOSED);
      }
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.failureThreshold || this.state === CircuitState.HALF_OPEN) {
        this.transition(CircuitState.OPEN);
      }
      throw err;
    }
  }

  private transition(newState: CircuitState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }
}
