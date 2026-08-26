import { ToolRegistry } from '../tools/index.js';
import type { Tool } from '../tools/index.js';
import type { MCPTool, MCPTransport } from './types.js';
import { StdioTransport } from './stdio-transport.js';

export class MCPClient {
  private connections = new Map<string, { transport: MCPTransport; tools: MCPTool[] }>();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async connect(config: { name: string; transport: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }): Promise<void> {
    if (this.connections.has(config.name)) {
      throw new Error(`MCP server already connected: ${config.name}`);
    }

    const transport = new StdioTransport({
      name: config.name,
      transport: 'stdio',
      command: config.command,
      args: config.args,
      env: config.env,
    });

    await transport.connect();

    const tools = await transport.listTools();
    
    // Register tools with prefix to avoid collisions
    for (const mcpTool of tools) {
      const namespacedName = `mcp.${config.name}.${mcpTool.name}`;
      const tool: Tool = {
        name: namespacedName,
        description: `[MCP:${config.name}] ${mcpTool.description}`,
        inputSchema: mcpTool.inputSchema as import('../types.js').JSONSchema,
        handler: async (args) => {
          const transport = this.connections.get(config.name)?.transport;
          if (!transport) throw new Error(`Transport not found for ${config.name}`);
          return transport.callTool(mcpTool.name, args);
        },
      };
      this.toolRegistry.register(tool);
    }

    this.connections.set(config.name, { transport, tools });
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn) {
      // Unregister tools
      for (const tool of conn.tools) {
        const namespacedName = `mcp.${name}.${tool.name}`;
        this.toolRegistry.unregister(namespacedName);
      }
      await conn.transport.disconnect();
      this.connections.delete(name);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnect(name);
    }
  }

  getConnectedServers(): string[] {
    return Array.from(this.connections.keys());
  }

  isConnected(name: string): boolean {
    const conn = this.connections.get(name);
    return conn?.transport.isConnected() ?? false;
  }
}