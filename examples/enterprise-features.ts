import {
  InMemoryStore,
  SqliteStore,
  MetricsCollector,
  EventLogger,
  HealthManager,
  CircuitBreaker,
  TokenBucketRateLimiter,
  AuditLogger,
  SecretMasker,
} from '../dist/index.js';

async function main() {
  // ── Memory ────────────────────────────────────────────────────────────────
  const mem = new SqliteStore({ path: ':memory:' });
  await mem.set('ns', 'key', 'value', 5000);
  console.log('Memory get:', await mem.get('ns', 'key'));
  await mem.destroy();

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = new MetricsCollector();
  metrics.incrementCounter('requests_total', { method: 'GET', status: '200' });
  metrics.recordHistogram('request_duration_ms', 45.2, { method: 'GET' });
  metrics.gauge('queue_size', 7);
  console.log('Metrics snapshot:', metrics.getSnapshot());

  // ── Event Logger ──────────────────────────────────────────────────────────
  const eventLog = new EventLogger('/tmp/harness-events.jsonl');
  // eventLog.onEvent({ type: 'task_complete', ... }); // wired into harness events
  console.log('Event stats:', eventLog.getStats());

  // ── Circuit Breaker ───────────────────────────────────────────────────────
  const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000 });
  cb.onStateChange((state) => console.log('Circuit:', state));
  for (let i = 0; i < 3; i++) {
    await cb.execute(async () => { throw new Error('fail'); });
  }
  console.log('Circuit state after 3 failures:', cb.getState());
  // Next call should fail immediately (OPEN)
  const start = Date.now();
  try {
    await cb.execute(async () => 'ok');
  } catch {
    console.log('Failed fast in', Date.now() - start, 'ms');
  }

  // ── Rate Limiter ─────────────────────────────────────────────────────────
  const limiter = new TokenBucketRateLimiter({ tokens: 2, intervalMs: 1000 });
  console.log('Acquired:', await limiter.acquire());
  console.log('Acquired:', await limiter.acquire());
  console.log('Acquired (should fail):', await limiter.acquire());
  console.log('Wait time:', limiter.getWaitTime(), 'ms');

  // ── Audit Logger ──────────────────────────────────────────────────────────
  const audit = new AuditLogger({ logFile: '/tmp/harness-audit.jsonl' });
  audit.log({
    event: 'AGENT_SPAWN',
    actor: 'master-1',
    target: 'coder-1',
    outcome: 'success',
    metadata: { apiKey: 'sk-xxx', token: 'Bearer xxx' },
  });
  console.log('Audit log written to /tmp/harness-audit.jsonl');

  // ── Secret Masker ─────────────────────────────────────────────────────────
  const mask = new SecretMasker();
  const masked = mask.maskObject({
    apiKey: 'sk-12345',
    user: 'alice',
    token: 'Bearer abc123',
    nested: { password: 's3cr3t' },
  });
  console.log('Masked:', JSON.stringify(masked));
  // { apiKey: '***REDACTED***', user: 'alice', token: '***REDACTED***', nested: { password: '***REDACTED***' } }

  // ── Health Manager ─────────────────────────────────────────────────────────
  const hm = new HealthManager([], 10_000);
  await hm.start();
  // hm.addProvider(openaiProvider);
  console.log('Health:', hm.getAllHealth());
  await hm.stop();
}

main().catch(console.error);
