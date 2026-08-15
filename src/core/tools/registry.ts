import type { JSONSchema } from '../types.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown) => Promise<{ success: boolean; output?: string; error?: string }>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }
}
