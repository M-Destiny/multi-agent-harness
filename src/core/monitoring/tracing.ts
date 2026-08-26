import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { Span as OTelSpan, Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import crypto from 'node:crypto';

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
  return crypto.randomBytes(bytes).toString('hex');
}

export class TracingService {
  private tracer: Tracer | null = null;
  private provider: NodeTracerProvider | null = null;
  private readonly spans = new Map<string, Span>();
  private readonly activeStacks = new Map<string, Span[]>();
  private readonly otelSpans = new Map<string, OTelSpan>();
  private readonly traceExporter: (span: Span) => void;

  constructor(exporter?: (span: Span) => void) {
    this.traceExporter = exporter ?? this.defaultExporter;
  }

  initialize(config: { enabled: boolean; serviceName?: string; exporter?: 'grpc' | 'http' | 'console'; endpoint?: string }): void {
    if (!config.enabled) return;

    let spanExporter;
    if (config.exporter === 'console') {
      spanExporter = new ConsoleSpanExporter();
    } else {
      // http by default
      spanExporter = new OTLPTraceExporter({
        url: config.endpoint ?? 'http://localhost:4318/v1/traces',
      });
    }

    const providerConfig = {
      resource: resourceFromAttributes({
        'service.name': config.serviceName ?? 'multi-agent-harness',
      }),
      spanProcessors: [new BatchSpanProcessor(spanExporter)],
    };

    this.provider = new NodeTracerProvider(providerConfig as never);
    this.provider.register();

    this.tracer = trace.getTracer('multi-agent-harness');
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

    if (this.tracer) {
      const otelSpan = this.tracer.startSpan(name, {
        attributes,
        startTime: span.startTime,
      });
      this.otelSpans.set(spanId, otelSpan);
    }

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

    const otelSpan = this.otelSpans.get(spanId);
    if (otelSpan) {
      for (const e of events) {
        otelSpan.addEvent(e.name, e.attributes);
      }
      otelSpan.setAttributes(span.attributes);
      otelSpan.end(span.endTime);
      this.otelSpans.delete(spanId);
    }

    this.activeStacks.forEach((stack) => {
      const idx = stack.findIndex((s) => s.spanId === spanId);
      if (idx !== -1) stack.splice(idx, 1);
    });
  }

  async withSpan<T>(
    name: string,
    fn: (spanId: string) => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const spanId = this.startSpan(name, attributes);
    const otelSpan = this.otelSpans.get(spanId);

    if (this.tracer && otelSpan) {
      return context.with(trace.setSpan(context.active(), otelSpan), async () => {
        try {
          return await fn(spanId);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          otelSpan.recordException(err);
          otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          throw e;
        } finally {
          this.endSpan(spanId);
        }
      });
    } else {
      try {
        return await fn(spanId);
      } finally {
        this.endSpan(spanId);
      }
    }
  }

  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  getAllSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  private defaultExporter(_span: Span): void {
    // Custom exporter placeholder
  }
}

// Singleton
export const tracing = new TracingService();
