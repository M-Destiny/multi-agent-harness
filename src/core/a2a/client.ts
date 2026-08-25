import { EventEmitter } from 'node:events';
import type { A2AClient, A2AAgentCard, A2ATaskStatusUpdate, A2AMessage, A2AClientConfig, A2AAuthConfig, A2ATaskStatus } from './types.js';
import type { A2ATask } from './types.js';
export class A2AClientImpl extends EventEmitter implements A2AClient {
  private baseUrl: string;
  private auth?: A2AAuthConfig;
  private timeout: number;

  constructor(config: A2AClientConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.auth = config.auth;
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.auth) {
      if (this.auth.scheme === 'bearer' && this.auth.token) {
        headers['Authorization'] = `Bearer ${this.auth.token}`;
      } else if (this.auth.scheme === 'apiKey' && this.auth.token) {
        headers['X-API-Key'] = this.auth.token;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`A2A request failed: ${response.status} ${error}`);
      }

      return response.json() as Promise<T>;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw e;
    }
  }

  async discover(): Promise<A2AAgentCard> {
    return this.request<A2AAgentCard>('GET', '/.well-known/agent.json');
  }

  async sendTask(message: A2AMessage, options?: { streaming?: boolean; timeout?: number }): Promise<A2ATask> {
    const task = await this.request<A2ATask>('POST', '/tasks', {
      message,
      streaming: options?.streaming ?? false,
    });
    return task;
  }

  async getTask(taskId: string): Promise<A2ATask> {
    return this.request<A2ATask>('GET', `/tasks/${taskId}`);
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.request('POST', `/tasks/${taskId}/cancel`);
  }

  async *subscribeTask(taskId: string): AsyncGenerator<A2ATaskStatusUpdate> {
    // For SSE streaming, we'd use EventSource
    // This is a simplified implementation
    let status: A2ATaskStatus = 'submitted';
    
    while (status !== 'completed' && status !== 'failed' && status !== 'canceled') {
      const task = await this.getTask(taskId);
      if (task.status !== status) {
        status = task.status;
        yield {
          taskId,
          status,
          message: task.message,
          artifact: task.artifacts?.[0],
        };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

export function createA2AClient(config: A2AClientConfig): A2AClient {
  return new A2AClientImpl(config);
}