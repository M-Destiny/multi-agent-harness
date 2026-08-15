import type { CompletionOptions, LLMMessage, LLMProvider, LLMResponse } from '../llm/provider.js';
import type { JSONSchema, ToolCall } from '../types.js';
import { ToolRegistry } from './registry.js';
import type { Tool } from './registry.js';

export class ToolCallServer {
  constructor(
    private readonly provider: LLMProvider,
    private readonly registry: ToolRegistry,
    private readonly maxIterations = 5,
  ) {}

  async complete(messages: LLMMessage[], options?: CompletionOptions): Promise<LLMResponse> {
    const tools = this.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as JSONSchema,
    }));

    const enrichedOptions: CompletionOptions = { ...options, tools };

    let currentMessages = [...messages];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      const response = await this.provider.complete(currentMessages, enrichedOptions);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response;
      }

      const toolMessages: LLMMessage[] = [];

      for (const call of response.toolCalls) {
        const fn = call.function;
        const result = await this.executeTool(fn.name, fn.arguments);
        toolMessages.push({
          role: 'tool',
          content: result.success ? (result.output ?? '') : `Error: ${result.error}`,
          toolCallId: call.id,
        });
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content, toolCalls: response.toolCalls },
        ...toolMessages,
      ];
    }

    // Max iterations reached — return last response stripped of tools to break the loop
    return this.provider.complete(currentMessages, { ...enrichedOptions, tools: [] });
  }

  private async executeTool(name: string, arguments_: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const tool = this.registry.get(name);
    if (!tool) return { success: false, error: `Tool not found: ${name}` };
    try {
      const parsed = JSON.parse(arguments_);
      return await tool.handler(parsed);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
