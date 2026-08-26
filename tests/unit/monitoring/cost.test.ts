import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CostTracker } from '../../../src/core/monitoring/cost.js';

describe('CostTracker & Budget Limits', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = CostTracker.getInstance();
    tracker.reset();
  });

  it('calculates costs correctly based on model pricing', async () => {
    // Override pricing for test
    tracker.setPricing('mock-model', { inputCostPer1M: 10, outputCostPer1M: 20 });
    
    await tracker.recordUsage('t-1', 'mock-model', 100_000, 200_000);
    
    const breakdown = tracker.getUsageBreakdown('t-1');
    expect(breakdown.promptTokens).toBe(100_000);
    expect(breakdown.completionTokens).toBe(200_000);
    // (100000 / 1M) * 10 = $1.00
    // (200000 / 1M) * 20 = $4.00
    // Total = $5.00
    expect(breakdown.costUsd).toBe(5.00);
  });

  it('enforces hard budget limits and triggers alert webhook', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    tracker.setPricing('mock-model', { inputCostPer1M: 10, outputCostPer1M: 20 });
    tracker.setBudget('t-1', {
      limitUsd: 10,
      alertThresholdPercent: 80,
      webhookUrl: 'http://localhost/webhook',
    });

    // Cost will be $4.00 (below 80% threshold of $8.00)
    await tracker.recordUsage('t-1', 'mock-model', 400_000, 0);
    expect(mockFetch).not.toHaveBeenCalled();

    // Cost will be $9.00 (exceeds 80% threshold)
    await tracker.recordUsage('t-1', 'mock-model', 500_000, 0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Cost will be $11.00 (exceeds hard limit $10) -> must throw error
    await expect(
      tracker.recordUsage('t-1', 'mock-model', 200_000, 0)
    ).rejects.toThrow('Hard budget limit reached');
  });

  it('generates prometheus metrics', async () => {
    tracker.setPricing('mock-model', { inputCostPer1M: 10, outputCostPer1M: 20 });
    await tracker.recordUsage('t-2', 'mock-model', 100_000, 0);

    const metrics = tracker.getMetricsSnapshot();
    expect(metrics).toContain('cost_total');
    expect(metrics).toContain('key="t-2"');
  });
});
