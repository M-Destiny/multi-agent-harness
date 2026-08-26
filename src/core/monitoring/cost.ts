import { PrometheusMetrics } from './prometheus.js';

export interface BudgetConfig {
  limitUsd: number;
  alertThresholdPercent?: number; // e.g. 80
  webhookUrl?: string;
}

export interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputCostPer1M: 5.0, outputCostPer1M: 15.0 },
  'gpt-4o-mini': { inputCostPer1M: 0.15, outputCostPer1M: 0.60 },
  'gpt-4-turbo': { inputCostPer1M: 10.0, outputCostPer1M: 30.0 },
  'gpt-4': { inputCostPer1M: 30.0, outputCostPer1M: 60.0 },
  'claude-3-5-sonnet': { inputCostPer1M: 3.0, outputCostPer1M: 15.0 },
  'claude-3-5-haiku': { inputCostPer1M: 0.8, outputCostPer1M: 4.0 },
};

export class CostTracker {
  private static instance: CostTracker | null = null;
  private pricing = new Map<string, ModelPricing>(Object.entries(DEFAULT_PRICING));
  private usage = new Map<string, { promptTokens: number; completionTokens: number; costUsd: number }>();
  private budgets = new Map<string, BudgetConfig>();
  private alerted = new Set<string>();
  private metrics = new PrometheusMetrics();

  static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker();
    }
    return CostTracker.instance;
  }

  setPricing(model: string, pricing: ModelPricing): void {
    this.pricing.set(model, pricing);
  }

  setBudget(key: string, config: BudgetConfig): void {
    this.budgets.set(key, config);
  }

  getCost(key: string): number {
    return this.usage.get(key)?.costUsd ?? 0;
  }

  getUsageBreakdown(key: string) {
    return this.usage.get(key) ?? { promptTokens: 0, completionTokens: 0, costUsd: 0 };
  }

  async recordUsage(
    key: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    const rate = this.pricing.get(model) ?? { inputCostPer1M: 10.0, outputCostPer1M: 30.0 };
    const inputCost = (promptTokens / 1_000_000) * rate.inputCostPer1M;
    const outputCost = (completionTokens / 1_000_000) * rate.outputCostPer1M;
    const cost = inputCost + outputCost;

    const existing = this.usage.get(key) ?? { promptTokens: 0, completionTokens: 0, costUsd: 0 };
    existing.promptTokens += promptTokens;
    existing.completionTokens += completionTokens;
    existing.costUsd += cost;
    this.usage.set(key, existing);

    this.metrics.gauge('cost_total', existing.costUsd, { key, model });
    
    const budget = this.budgets.get(key);
    if (budget) {
      const budgetRemaining = Math.max(0, budget.limitUsd - existing.costUsd);
      this.metrics.gauge('budget_remaining', budgetRemaining, { key });

      const threshold = budget.alertThresholdPercent ?? 80;
      const spentPercent = (existing.costUsd / budget.limitUsd) * 100;
      
      if (spentPercent >= threshold && !this.alerted.has(`${key}:${threshold}`)) {
        this.alerted.add(`${key}:${threshold}`);
        this.metrics.counter('budget_alert', { key, threshold: String(threshold) });
        await this.triggerAlert(key, spentPercent, existing.costUsd, budget);
      }

      if (existing.costUsd >= budget.limitUsd) {
        this.alerted.add(`${key}:hard_limit`);
        throw new Error(`Hard budget limit reached for ${key} ($${existing.costUsd.toFixed(4)} >= $${budget.limitUsd.toFixed(4)}). Execution halted.`);
      }
    }
  }

  private async triggerAlert(key: string, spentPercent: number, costUsd: number, budget: BudgetConfig): Promise<void> {
    const message = `[BUDGET ALERT] Key ${key} has spent ${spentPercent.toFixed(2)}% of budget ($${costUsd.toFixed(4)} / $${budget.limitUsd.toFixed(4)}).`;
    console.warn(message);

    if (budget.webhookUrl) {
      try {
        await fetch(budget.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, spentPercent, costUsd, limitUsd: budget.limitUsd, message })
        });
      } catch (e) {
        console.error(`Failed to post budget alert webhook:`, e);
      }
    }
  }

  getMetricsSnapshot(): string {
    return this.metrics.serialize();
  }

  reset(): void {
    this.usage.clear();
    this.budgets.clear();
    this.alerted.clear();
    this.metrics = new PrometheusMetrics();
  }
}
