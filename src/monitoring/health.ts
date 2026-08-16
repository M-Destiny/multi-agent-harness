import type { LLMProvider } from '../llm/provider.js';
import type { HealthStatus } from '../types.js';

export interface ProviderHealth {
  name: string;
  status: HealthStatus;
  lastUpdated: Date;
}

export class HealthManager {
  private readonly health = new Map<string, ProviderHealth>();
  private readonly intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly providers: LLMProvider[],
    intervalMs = 30_000,
  ) {
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    // Run immediately
    await this.checkAll();
    // Then periodically
    this.timer = setInterval(() => this.checkAll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async checkAll(): Promise<void> {
    await Promise.all(this.providers.map(async (p) => {
      const status = await p.healthCheck();
      this.health.set(p.name, { name: p.name, status, lastUpdated: new Date() });
    }));
  }

  getProviderHealth(name: string): ProviderHealth | undefined {
    return this.health.get(name);
  }

  getAllHealth(): Map<string, ProviderHealth> {
    return new Map(this.health);
  }
}
