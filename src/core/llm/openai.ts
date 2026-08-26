import type { CompletionOptions, HealthStatus, LLMChunk, LLMConfig, LLMMessage, LLMProvider, LLMResponse, UsageStats } from '../types.js';
import { LLMError } from './provider.js';
import { tracing } from '../monitoring/tracing.js';

interface OpenAIChoice {
  message: { content?: string; tool_calls?: LLMResponse['toolCalls'] };
}
interface OpenAIStreamDelta {
  content?: string;
  tool_calls?: unknown[];
}
interface OpenAIStreamChoice {
  delta: OpenAIStreamDelta;
}
interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}
interface OpenAIStreamResponse {
  choices: OpenAIStreamChoice[];
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'];
  private usage: UsageStats = { totalRequests: 0, totalTokens: 0, totalCostUsd: 0, errors: 0, byModel: {} };

  constructor(public readonly config: LLMConfig) {}

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const model = this.config.model;
    const temp = options?.temperature ?? this.config.temperature;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    const attributes = {
      'gen_ai.operation.name': 'completion',
      'gen_ai.request.model': model,
      'gen_ai.request.temperature': temp,
      'gen_ai.request.max_tokens': maxTokens,
    };

    return tracing.withSpan('openai.complete', async (spanId) => {
      const body: Record<string, unknown> = {
        model,
        messages: this.buildMessages(messages, options),
        temperature: temp,
        max_tokens: maxTokens,
      };
      if (options?.tools && options.tools.length > 0) {
        body['tools'] = options.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
        body['tool_choice'] = options.toolChoice ?? 'auto';
      }
      const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, body);
      if (!res.ok) {
        const text = await res.text();
        throw new LLMError(`OpenAI error: ${text}`, 'openai', model, res.status);
      }
      const data = (await res.json()) as OpenAIResponse;
      const choice = data.choices[0]!;
      const usage = data.usage;
      this.trackUsage(usage.total_tokens);

      const span = tracing.getSpan(spanId);
      if (span) {
        span.attributes['gen_ai.response.model'] = model;
        span.attributes['gen_ai.usage.prompt_tokens'] = usage.prompt_tokens;
        span.attributes['gen_ai.usage.completion_tokens'] = usage.completion_tokens;
      }

      return {
        content: choice.message.content ?? '',
        toolCalls: choice.message.tool_calls ?? undefined,
        usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
        model,
      };
    }, attributes);
  }

  async *stream(messages: LLMMessage[], options?: CompletionOptions): AsyncIterable<LLMChunk> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.buildMessages(messages, options),
      temperature: options?.temperature ?? this.config.temperature,
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      stream: true,
    };
    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, body);
    if (!res.ok) {
      const text = await res.text();
      throw new LLMError(`OpenAI stream error: ${text}`, 'openai', this.config.model, res.status);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') { yield { content: '', done: true }; return; }
        try {
          const obj = JSON.parse(payload) as OpenAIStreamResponse;
          const delta = obj.choices[0]?.delta;
          yield { content: delta?.content ?? '', done: false };
        } catch { /* skip malformed line */ }
      }
    }
    yield { content: '', done: true };
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: { Authorization: `Bearer ${this.config.apiKey}` } });
      return { healthy: res.ok, latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (e) {
      return { healthy: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e), lastChecked: new Date() };
    }
  }

  async getUsage(): Promise<UsageStats> {
    return { ...this.usage, byModel: { ...this.usage.byModel } };
  }

  private buildMessages(messages: LLMMessage[], options?: CompletionOptions): LLMMessage[] {
    const result: LLMMessage[] = [];
    const sys = options?.systemPrompt ?? '';
    if (sys) result.push({ role: 'system', content: sys });
    for (const m of messages) {
      if (m.role === 'system' && sys) continue;
      result.push(m);
    }
    return result;
  }

  private async fetchWithTimeout(url: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
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
