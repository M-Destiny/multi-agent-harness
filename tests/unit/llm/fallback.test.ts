import { describe, it, expect, vi } from 'vitest';
import { FallbackProvider } from '../../../src/llm/fallback.ts';
import { LLMError } from '../../../src/llm/provider.ts';
import type { LLMProvider } from '../../../src/types.ts';

function makeMockProvider(name: string, fail?: boolean, statusCode = 500): LLMProvider {
  return {
    name,
    models: ['gpt-4o'],
    config: { provider: 'openai', model: 'gpt-4o', apiKey: 'test', temperature: 0.7, maxTokens: 2048, timeoutMs: 30000 },
    complete: vi.fn().mockImplementation(() => {
      if (fail) return Promise.reject(new LLMError(`${name} failed`, name, 'gpt-4o', statusCode));
      return Promise.resolve({ content: `${name} ok`, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, model: 'gpt-4o' });
    }),
    stream: async function* () { if (fail) throw new LLMError('stream fail', name, 'gpt-4o', statusCode); yield { content: `${name} ok`, done: true }; },
    healthCheck: vi.fn().mockResolvedValue({ healthy: !fail, latencyMs: 5, lastChecked: new Date() }),
    getUsage: vi.fn().mockResolvedValue({ totalRequests: 1, totalTokens: 2, totalCostUsd: 0, errors: 0, byModel: {} }),
  };
}

describe('FallbackProvider', () => {
  it('returns result from primary when it succeeds', async () => {
    const primary = makeMockProvider('primary');
    const fallback = makeMockProvider('fallback');
    const fp = new FallbackProvider(primary, fallback);
    const res = await fp.complete([], {});
    expect(res.content).toBe('primary ok');
    expect(primary.complete).toHaveBeenCalled();
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('falls back when primary throws LLMError', async () => {
    const primary = makeMockProvider('primary', true, 500);
    const fallback = makeMockProvider('fallback');
    const fp = new FallbackProvider(primary, fallback);
    const res = await fp.complete([], {});
    expect(res.content).toBe('fallback ok');
    expect(fallback.complete).toHaveBeenCalled();
  });

  it('falls back on 429 rate limit', async () => {
    const primary = makeMockProvider('primary', true, 429);
    const fallback = makeMockProvider('fallback');
    const fp = new FallbackProvider(primary, fallback);
    const res = await fp.complete([], {});
    expect(res.content).toBe('fallback ok');
  });

  it('throws FallbackExhaustedError when all providers fail', async () => {
    const p1 = makeMockProvider('p1', true, 500);
    const p2 = makeMockProvider('p2', true, 500);
    const fp = new FallbackProvider(p1, p2);
    await expect(fp.complete([], {})).rejects.toThrow('All LLM providers failed');
  });

  it('records provider health', async () => {
    const primary = makeMockProvider('primary', true, 500);
    const fallback = makeMockProvider('fallback');
    const fp = new FallbackProvider(primary, fallback);
    const health = await fp.getProviderHealth();
    expect(health.get('primary')?.healthy).toBe(false);
    expect(health.get('fallback')?.healthy).toBe(true);
  });

  it('getUsage merges all provider stats', async () => {
    const p1 = makeMockProvider('p1');
    const p2 = makeMockProvider('p2');
    const fp = new FallbackProvider(p1, p2);
    await fp.complete([], {});
    const usage = await fp.getUsage();
    expect(usage.totalRequests).toBeGreaterThan(0);
  });
});
