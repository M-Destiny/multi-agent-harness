import { describe, expect, it } from 'vitest';
import { TracingService } from '../../../src/core/monitoring/tracing.js';

describe('TracingService', () => {
  it('should start and end spans and export them', async () => {
    let exportedSpan: any = null;
    const tracing = new TracingService((span) => {
      exportedSpan = span;
    });

    const spanId = tracing.startSpan('test-span', { foo: 'bar' });
    expect(spanId).toBeDefined();

    const span = tracing.getSpan(spanId);
    expect(span).toBeDefined();
    expect(span?.name).toBe('test-span');
    expect(span?.attributes.foo).toBe('bar');

    tracing.endSpan(spanId, [{ name: 'event-1' }]);
    expect(exportedSpan).toBeDefined();
    expect(exportedSpan.status).toBe('ended');
    expect(exportedSpan.events[0].name).toBe('event-1');
  });

  it('should support withSpan method and context dynamic attributes', async () => {
    let exportedSpan: any = null;
    const tracing = new TracingService((span) => {
      exportedSpan = span;
    });

    const result = await tracing.withSpan('with-span-test', async (spanId) => {
      const span = tracing.getSpan(spanId);
      if (span) {
        span.attributes.dynamic = 'value';
      }
      return 'hello';
    }, { initial: 'yes' });

    expect(result).toBe('hello');
    expect(exportedSpan).toBeDefined();
    expect(exportedSpan.attributes.initial).toBe('yes');
    expect(exportedSpan.attributes.dynamic).toBe('value');
  });
});
