import type { CompletionOptions, HealthStatus, LLMChunk, LLMConfig, LLMMessage, LLMProvider, LLMResponse, UsageStats } from '../types.js';
import { FallbackExhaustedError, LLMError } from './provider.js';

export class FallbackProvider implements LLMProvider {
  readonly name = 'fallback';
  private readonly providers: LLMProvider[];
  private activeIndex = 0;

  constructor(...providers: LLMProvider[]) {
    this.providers = providers;
  }

  get config(): LLMConfig { return this.providers[this.activeIndex]!.config; }
  get models(): ReadonlyArray<string> { return this.providers.flatMap((p) => p.models); }

  async complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const errors: Error[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;
      try {
        return await provider.complete(messages, options);
      } catch (e) {
        if (e instanceof LLMError && e.recoverable) {
          errors.push(e);
          this.activeIndex = Math.min(i + 1, this.providers.length - 1);
          continue;
        }
        throw e;
      }
    }
    throw new FallbackExhaustedError(
      'All LLM providers failed',
      this.providers.map((p) => p.name),
      errors[errors.length - 1] ?? new Error('unknown'),
    );
  }

  async *stream(messages: LLMMessage[], options?: CompletionOptions): AsyncIterable<LLMChunk> {
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;
      try {
        yield* provider.stream(messages, options);
        return;
      } catch (e) {
        if (e instanceof LLMError && e.recoverable) continue;
        throw e;
      }
    }
    throw new FallbackExhaustedError('All providers exhausted for stream', this.providers.map((p) => p.name), new Error('all failed'));
  }

  async healthCheck(): Promise<HealthStatus> {
    for (const p of this.providers) {
      const status = await p.healthCheck();
      if (status.healthy) return status;
    }
    const last = await this.providers[this.providers.length - 1]!.healthCheck();
    return last;
  }

  async getUsage(): Promise<UsageStats> {
    const all = await Promise.all(this.providers.map((p) => p.getUsage()));
    const merged: UsageStats = { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, errors: 0, byModel: {} };
    for (const u of all) {
      merged.totalRequests += u.totalRequests;
      merged.totalTokens += u.totalTokens;
      merged.totalCostUsd += u.totalCostUsd;
      merged.errors += u.errors;
      for (const [k, v] of Object.entries(u.byModel)) {
        const entry = merged.byModel[k] ?? { requests: 0, tokens: 0 };
        entry.requests += v.requests;
        entry.tokens += v.tokens;
        merged.byModel[k] = entry;
      }
    }
    return merged;
  }

  async getProviderHealth(): Promise<Map<string, HealthStatus>> {
    const map = new Map<string, HealthStatus>();
    await Promise.all(
      this.providers.map(async (p) => {
        const status = await p.healthCheck();
        map.set(p.name, status);
      }),
    );
    return map;
  }
}
