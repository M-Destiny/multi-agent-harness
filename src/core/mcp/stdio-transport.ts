import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { MCPTransport, MCPTool, MCPServerConfig } from './types.js';

export class StdioTransport extends EventEmitter implements MCPTransport {
  private process: ChildProcess | null = null;
  private config: MCPServerConfig;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private buffer = '';
  private connected = false;

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error('Stdio transport requires command');
    }

    this.process = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
      throw new Error('Failed to spawn stdio process');
    }

    this.process.stdout.on('data', (data) => this.handleData(data.toString()));
    this.process.stderr.on('data', (data) => this.emit('error', new Error(data.toString())));

    this.process.on('error', (err) => this.emit('error', err));
    this.process.on('exit', (code) => {
      this.connected = false;
      this.emit('close', code);
    });

    // Initialize the MCP connection
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'multi-agent-harness', version: '0.1.0' },
    });

    await this.sendNotification('initialized', {});

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.process !== null;
  }

  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {}) as { tools: Array<{ name: string; description: string; inputSchema: object }> };
    return (result.tools || []).map(t => ({ 
      name: t.name, 
      description: t.description, 
      inputSchema: t.inputSchema as import('../types.js').JSONSchema, 
      serverName: this.config.name 
    }));
  }

  async callTool(name: string, args: unknown): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const result = await this.sendRequest('tools/call', { name, arguments: args }) as { content: Array<{ type: string; text: string }> };
      const text = result.content?.map(c => c.text).join('\n') ?? '';
      return { success: true, output: text };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process?.stdin) throw new Error('Not connected');

    const id = ++this.requestId;
    const message = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(message) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.process?.stdin) throw new Error('Not connected');
    const message = { jsonrpc: '2.0', method, params };
    this.process.stdin!.write(JSON.stringify(message) + '\n');
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          if (message.error) {
            reject(new Error(message.error.message || 'Unknown error'));
          } else {
            resolve(message.result);
          }
        } else if (message.method) {
          this.emit('notification', message);
        }
      } catch {
        // Ignore parse errors for partial messages
      }
    }
  }
}