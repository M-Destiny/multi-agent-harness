import { describe, it, expect } from 'vitest';
import { RetryPolicy } from '../../../src/resilience/retry-policy.ts';

describe('RetryPolicy', () => {
  it('succeeds on first try', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });
    const result = await policy.execute(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('retries and then succeeds', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 10 });
    let attempts = 0;
    const result = await policy.execute(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient');
      return 'recovered';
    });
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('throws when max attempts exceeded', async () => {
    const policy = new RetryPolicy({ maxAttempts: 2, baseDelayMs: 5 });
    let attempts = 0;
    await expect(policy.execute(async () => {
      attempts++;
      throw new Error('permanent');
    })).rejects.toThrow('permanent');
    expect(attempts).toBe(2); // first attempt + 1 retry = 2 total
  });

  it('onRetry callback fires', async () => {
    const retries: { attempt: number; delayMs: number }[] = [];
    const policy = new RetryPolicy({
      maxAttempts: 3, baseDelayMs: 5, jitter: false,
      onRetry: (attempt, delay) => retries.push({ attempt, delayMs: delay }),
    });
    let attempts = 0;
    await expect(policy.execute(async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return 'done';
    })).resolves.toBe('done'); // succeeds on 3rd attempt
    expect(retries.length).toBe(2); // 2 retries before success
  });

  it('retryable filter skips non-retryable errors', async () => {
    const policy = new RetryPolicy({
      maxAttempts: 3, baseDelayMs: 5,
      retryable: (err) => (err as Error).message !== 'permanent',
    });
    let attempts = 0;
    await expect(policy.execute(async () => {
      attempts++;
      throw new Error('permanent');
    })).rejects.toThrow('permanent');
    expect(attempts).toBe(1); // no retries — not retryable
  });
});
