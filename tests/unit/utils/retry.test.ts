import { describe, it, expect, vi } from 'vitest';
import { retry } from '../../../src/utils/retry.ts';
import { parallelMap } from '../../../src/utils/parallel.ts';

describe('retry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 10, factor: 2, maxDelayMs: 1000, jitter: false });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries then succeeds on second attempt', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('fail');
      return 'ok';
    });
    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 10, factor: 2, maxDelayMs: 1000, jitter: false });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(
      retry(fn, { maxAttempts: 3, baseDelayMs: 5, factor: 2, maxDelayMs: 1000, jitter: false }),
    ).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry before each delay', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    });
    await retry(fn, { maxAttempts: 3, baseDelayMs: 5, factor: 2, maxDelayMs: 1000, jitter: false }, onRetry);
    // onRetry called after attempt 1 and attempt 2 failures
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0].attempt).toBe(1);
    expect(onRetry.mock.calls[1][0].attempt).toBe(2);
  });
});

describe('parallelMap', () => {
  it('runs with concurrency 1 (sequential)', async () => {
    const results = await parallelMap([1, 2, 3], 1, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6]);
  });

  it('runs with concurrency 3', async () => {
    const results = await parallelMap([1, 2, 3], 3, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6]);
  });

  it('handles empty array', async () => {
    const results = await parallelMap([], 3, async (n) => n * 2);
    expect(results).toEqual([]);
  });

  it('propagates first error thrown', async () => {
    await expect(
      parallelMap([1, 2, 3], 3, async (n) => { if (n === 2) throw new Error('boom'); return n; }),
    ).rejects.toThrow('boom');
  });
});
