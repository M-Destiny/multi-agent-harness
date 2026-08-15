export interface MetricValue {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface Counter {
  total: number;
  lastValue: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export class MetricsCollector {
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, MetricValue[]>();
  private gauges = new Map<string, MetricValue>();

  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.total++;
      existing.lastValue = existing.total;
    } else {
      this.counters.set(key, { total: 1, lastValue: 1 });
    }
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.histograms.get(key) ?? [];
    existing.push({ value, labels, timestamp: Date.now() });
    this.histograms.set(key, existing);
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.gauges.set(this.key(name, labels), { value, labels, timestamp: Date.now() });
  }

  getSnapshot(): {
    counters: Map<string, Counter>;
    histograms: Map<string, MetricValue[]>;
    gauges: Map<string, MetricValue>;
  } {
    return {
      counters: new Map(this.counters),
      histograms: new Map(this.histograms),
      gauges: new Map(this.gauges),
    };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}
