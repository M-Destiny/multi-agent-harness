import type { CompletionOptions, HealthStatus, LLMChunk, LLMConfig, LLMMessage, LLMProvider, LLMResponse, UsageStats } from '../types.js';
import { LLMError } from './provider.js';

interface AnthropicContent {
  type: string;
  text: string;
}
interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}
interface AnthropicResponse {
  content: AnthropicContent[];
  usage: AnthropicUsage;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly models = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
  private usage: UsageStats = { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, errors: 0, byModel: {} };

  constructor(public readonly config: LLMConfig) {}

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://api.anthropic.com';
  }

  async complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const systemPrompt = options?.systemPrompt ?? messages.find((m) => m.role === 'system')?.content ?? '';
    const apiMessages = messages.filter((m) => m.role !== 'system');
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: apiMessages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    };
    if (systemPrompt) body['system'] = systemPrompt;
    const res = await this.fetchWithTimeout(`${this.baseUrl}/v1/messages`, body);
    if (!res.ok) {
      const text = await res.text();
      throw new LLMError(`Anthropic error: ${text}`, 'anthropic', this.config.model, res.status);
    }
    const data = (await res.json()) as AnthropicResponse;
    const usage = data.usage;
    this.trackUsage(usage.input_tokens + usage.output_tokens);
    return {
      content: data.content.filter((c) => c.type === 'text').map((c) => c.text).join(''),
      usage: { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens, totalTokens: usage.input_tokens + usage.output_tokens },
      model: this.config.model,
    };
  }

  async *stream(_messages: LLMMessage[], _options?: CompletionOptions): AsyncIterable<LLMChunk> {
    throw new Error('Streaming not yet implemented for Anthropic provider');
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, { headers: { 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' } });
      return { healthy: res.ok, latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (e) {
      return { healthy: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e), lastChecked: new Date() };
    }
  }

  async getUsage(): Promise<UsageStats> {
    return { ...this.usage, byModel: { ...this.usage.byModel } };
  }

  private async fetchWithTimeout(url: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
  }

  private trackUsage(tokens: number): void {
    this.usage.totalRequests += 1;
    this.usage.totalTokens += tokens;
    const entry = this.usage.byModel[this.config.model] ?? { requests: 0, tokens: 0 };
    entry.requests += 1;
    entry.tokens += tokens;
    this.usage.byModel[this.config.model] = entry;
  }
}
