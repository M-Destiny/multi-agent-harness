export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  events: { name: string; timestamp: number }[];
  status: 'started' | 'ended';
}

function generateId(bytes = 8): string {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < bytes * 2; i++) id += hex[Math.floor(Math.random() * hex.length)];
  return id;
}

export class TracingService {
  private readonly spans = new Map<string, Span>();
  private readonly activeStacks = new Map<string, Span[]>();
  private readonly traceExporter: (span: Span) => void;

  constructor(exporter?: (span: Span) => void) {
    this.traceExporter = exporter ?? this.defaultExporter;
  }

  startSpan(name: string, attributes: Record<string, string | number | boolean> = {}): string {
    const spanId = generateId(8);
    const traceId = generateId(16);
    const span: Span = {
      name, traceId, spanId, startTime: Date.now(),
      attributes, events: [], status: 'started',
    };
    this.spans.set(spanId, span);
    const stack = this.activeStacks.get(name) ?? [];
    stack.push(span);
    this.activeStacks.set(name, stack);
    return spanId;
  }

  endSpan(spanId: string, events: { name: string; attributes?: Record<string, string | number | boolean> }[] = []): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = 'ended';
    for (const e of events) {
      span.events.push({ name: e.name, timestamp: Date.now() });
    }
    this.traceExporter(span);
    this.activeStacks.forEach((stack) => {
      const idx = stack.findIndex((s) => s.spanId === spanId);
      if (idx !== -1) stack.splice(idx, 1);
    });
  }

  async withSpan<T>(name: string, fn: () => Promise<T>, attributes?: Record<string, string | number | boolean>): Promise<T> {
    const spanId = this.startSpan(name, attributes);
    try {
      return await fn();
    } finally {
      this.endSpan(spanId);
    }
  }

  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  getAllSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  private defaultExporter(span: Span): void {
    const duration = span.durationMs != null ? `${span.durationMs}ms` : 'unknown';
    console.log(`[trace] ${span.name} ${span.traceId}/${span.spanId} ${duration}`);
  }
}

// Singleton
export const tracing = new TracingService();
