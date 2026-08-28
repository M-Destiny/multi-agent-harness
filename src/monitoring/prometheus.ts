export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels: Record<string, string>;
}

interface Counter { type: 'counter'; value: number }
interface Gauge { type: 'gauge'; value: number }
interface HistogramBucket { le: number; count: number }
interface Histogram { type: 'histogram'; sum: number; count: number; buckets: HistogramBucket[] }
interface Summary { type: 'summary'; sum: number; count: number }

export class PrometheusMetrics {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private summaries = new Map<string, Summary>();
  private readonly buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  counter(name: string, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.counters.get(key);
    if (existing) { existing.value++; }
    else { this.counters.set(key, { type: 'counter', value: 1 }); }
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    this.gauges.set(key, { type: 'gauge', value });
  }

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.histograms.get(key);
    if (existing) {
      existing.sum += value;
      existing.count++;
      for (const bucket of existing.buckets) {
        if (value <= bucket.le) bucket.count++;
      }
    } else {
      this.histograms.set(key, {
        type: 'histogram', sum: value, count: 1,
        buckets: this.buckets.map((le) => ({ le, count: value <= le ? 1 : 0 })),
      });
    }
  }

  summary(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const existing = this.summaries.get(key);
    if (existing) { existing.sum += value; existing.count++; }
    else { this.summaries.set(key, { type: 'summary', sum: value, count: 1 }); }
  }

  serialize(): string {
    const lines: string[] = [];
    for (const [key, m] of this.counters) {
      const metricName = key.split('{')[0];
      lines.push(`# TYPE ${metricName} counter`);
      lines.push(`# HELP ${metricName} counter`);
      lines.push(`${key} ${m.value}`);
    }
    for (const [key, m] of this.gauges) {
      const metricName = key.split('{')[0];
      lines.push(`# TYPE ${metricName} gauge`);
      lines.push(`# HELP ${metricName} gauge`);
      lines.push(`${key} ${m.value}`);
    }
    for (const [key, m] of this.histograms) {
      const metricName = key.split('{')[0];
      lines.push(`# TYPE ${metricName} histogram`);
      lines.push(`# HELP ${metricName} histogram`);
      for (const b of m.buckets) lines.push(`${key}_bucket{le="${b.le}"} ${b.count}`);
      lines.push(`${key}_sum ${m.sum}`);
      lines.push(`${key}_count ${m.count}`);
    }
    for (const [key, m] of this.summaries) {
      const metricName = key.split('{')[0];
      lines.push(`# TYPE ${metricName} summary`);
      lines.push(`# HELP ${metricName} summary`);
      lines.push(`${key}_sum ${m.sum}`);
      lines.push(`${key}_count ${m.count}`);
    }
    return lines.join('\n');
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}
