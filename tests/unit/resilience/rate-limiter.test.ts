import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenBucketRateLimiter, RateLimitError } from '../../../src/resilience/rate-limiter.ts';

describe('TokenBucketRateLimiter', () => {
  it('acquire returns true when tokens available', () => {
    const limiter = new TokenBucketRateLimiter({ tokens: 5, intervalMs: 1000 });
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(true);
  });

  it('acquire returns false when bucket empty', () => {
    const limiter = new TokenBucketRateLimiter({ tokens: 1, intervalMs: 10000 });
    expect(limiter.acquire()).toBe(true);
    expect(limiter.acquire()).toBe(false);
  });

  it('wrap throws RateLimitError when rate limited', async () => {
    const limiter = new TokenBucketRateLimiter({ tokens: 0, intervalMs: 10000 });
    await expect(limiter.wrap(async () => 'ok')).rejects.toThrow(RateLimitError);
  });

  it('wrap succeeds when tokens available', async () => {
    const limiter = new TokenBucketRateLimiter({ tokens: 2, intervalMs: 1000 });
    const result = await limiter.wrap(async () => 'success');
    expect(result).toBe('success');
  });

  it('getWaitTime returns 0 when tokens available', () => {
    const limiter = new TokenBucketRateLimiter({ tokens: 5, intervalMs: 1000 });
    expect(limiter.getWaitTime()).toBe(0);
  });
});
