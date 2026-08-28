import { beforeEach, describe, expect, it } from 'vitest';
import { PrometheusMetrics } from '../../../src/monitoring/prometheus.ts';

describe('PrometheusMetrics', () => {
  let metrics: PrometheusMetrics;

  beforeEach(() => { metrics = new PrometheusMetrics(); });

  it('counter increments', () => {
    metrics.counter('http_requests_total', { method: 'GET', status: '200' });
    metrics.counter('http_requests_total', { method: 'GET', status: '200' });
    metrics.counter('http_requests_total', { method: 'POST', status: '201' });
    const output = metrics.serialize();
    expect(output).toContain('http_requests_total{method="GET",status="200"} 2');
    expect(output).toContain('http_requests_total{method="POST",status="201"} 1');
  });

  it('gauge records current value', () => {
    metrics.gauge('queue_size', 7, { env: 'prod' });
    metrics.gauge('queue_size', 3, { env: 'prod' });
    const output = metrics.serialize();
    expect(output).toContain('queue_size{env="prod"} 3');
  });

  it('histogram records distribution', () => {
    metrics.histogram('request_duration_ms', 45, { method: 'GET' });
    metrics.histogram('request_duration_ms', 120, { method: 'GET' });
    const output = metrics.serialize();
    expect(output).toContain('request_duration_ms{method="GET"}_sum');
    expect(output).toContain('request_duration_ms{method="GET"}_count 2');
    expect(output).toContain('_bucket{le=');
  });

  it('serialize produces valid Prometheus text format', () => {
    metrics.counter('app_started_total', {});
    const output = metrics.serialize();
    expect(output).toContain('# TYPE app_started_total counter');
    expect(output).toContain('app_started_total 1');
  });
});
