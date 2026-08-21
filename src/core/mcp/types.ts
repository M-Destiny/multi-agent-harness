import type { JSONSchema } from '../types.js';

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  serverName: string;
}

export interface MCPClientConfig {
  servers: MCPServerConfig[];
  defaultServer?: string;
}

export interface MCPConnection {
  serverName: string;
  transport: MCPTransport;
  tools: MCPTool[];
  connected: boolean;
}

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: unknown): Promise<{ success: boolean; output?: string; error?: string }>;
  isConnected(): boolean;
}