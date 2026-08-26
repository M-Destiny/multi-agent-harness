import type { AgentConfig, CompletionOptions, LLMMessage, LLMProvider, LLMResponse, Task, TaskContext, TaskResult, ToolDefinition, ToolResult } from './types.js';
import { BaseAgent } from './types.js';
import type { MemoryStore } from './memory/store.js';
import { OpenAIProvider } from './llm/openai.js';
import { AnthropicProvider } from './llm/anthropic.js';
import { OpenRouterProvider } from './llm/openrouter.js';
import { SandboxRegistry } from './security/index.js';
import type { SandboxSession } from './security/index.js';
import { builtInTools } from './tools/index.js';

function createLLMProvider(config: AgentConfig['llmConfig']): LLMProvider {
  switch (config.provider) {
    case 'openai': return new OpenAIProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
    case 'openrouter': return new OpenRouterProvider(config);
    default: throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export class SubAgent extends BaseAgent {
  private provider: LLMProvider;
  private readonly toolHandlers = new Map<string, (args: unknown) => Promise<ToolResult>>();
  private sandboxSession: SandboxSession | null = null;

  constructor(
    config: AgentConfig,
    memoryStore: MemoryStore,
    /** For testing: inject a mock provider instead of creating a real one */
    provider?: LLMProvider,
  ) {
    super(config, memoryStore);
    this.provider = provider ?? createLLMProvider(config.llmConfig);
  }

  override async initialize(): Promise<void> {
    if (this.initialized) return;
    this.emit({ type: 'agent_spawn', agentId: this.id, timestamp: new Date() });

    if (this._config.sandbox?.enabled) {
      const provider = SandboxRegistry.get(this._config.sandbox.provider);
      if (provider) {
        this.sandboxSession = await provider.createSession(this._config.sandbox);
        for (const tool of builtInTools(this.sandboxSession)) {
          this.registerTool(tool.name, tool.handler);
        }
      }
    } else {
      for (const tool of builtInTools(null)) {
        this.registerTool(tool.name, tool.handler);
      }
    }

    this.initialized = true;
  }

  override async shutdown(): Promise<void> {
    if (this.sandboxSession) {
      await this.sandboxSession.close();
      this.sandboxSession = null;
    }
    this.initialized = false;
  }

  canHandle(task: Task): boolean {
    if (task.assignedAgentId && task.assignedAgentId !== this.id) return false;
    // If no capabilities are required, any agent can handle it
    return true;
  }

  async execute(task: Task, _context?: TaskContext): Promise<TaskResult> {
    this.emit({ type: 'task_start', taskId: task.id, agentId: this.id, timestamp: new Date() });
    const systemPrompt = this._config.systemPrompt || `You are ${this.name}, a sub-agent in a multi-agent harness.`;
    const messages: LLMMessage[] = [
      { role: 'user', content: `Task: ${task.name}\nDescription: ${task.description}\nAcceptance Criteria:\n${task.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}` },
    ];
    try {
      const response = await this.provider.complete(messages, { systemPrompt });
      this.emit({ type: 'llm_call', agentId: this.id, provider: this.provider.name, model: this.provider.config.model, tokens: response.usage.totalTokens, latencyMs: 0, timestamp: new Date() });
      const result: TaskResult = { output: response.content, artifacts: [] };
      this.emit({ type: 'task_complete', taskId: task.id, agentId: this.id, result, timestamp: new Date() });
      return result;
    } catch (error) {
      this.emit({ type: 'task_failed', taskId: task.id, agentId: this.id, error: error instanceof Error ? error : new Error(String(error)), timestamp: new Date() });
      throw error;
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
    return this.provider.complete(messages, options);
  }

  registerTool(name: string, handler: (args: unknown) => Promise<ToolResult>): void {
    this.toolHandlers.set(name, handler);
  }

  async callTool(toolName: string, args: unknown): Promise<ToolResult> {
    const handler = this.toolHandlers.get(toolName);
    if (!handler) return { success: false, error: `Tool "${toolName}" not found` };
    return handler(args);
  }

  availableTools(): ToolDefinition[] {
    return Array.from(this.toolHandlers.keys()).map((name) => ({ name, description: name, parameters: { type: 'object' } }));
  }
}
