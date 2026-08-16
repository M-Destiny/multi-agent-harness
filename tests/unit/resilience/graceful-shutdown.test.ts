import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GracefulShutdownManager } from '../../../src/core/resilience/graceful-shutdown.js';

describe('GracefulShutdownManager', () => {
  let manager: GracefulShutdownManager;
  const order: string[] = [];

  beforeEach(() => {
    manager = new GracefulShutdownManager();
    order.length = 0;
  });

  it('calls handlers in LIFO order', async () => {
    manager.register('first', async () => { order.push('first'); });
    manager.register('second', async () => { order.push('second'); });
    manager.register('third', async () => { order.push('third'); });
    const result = await manager.shutdown(5000);
    expect(result.completedHandlers).toEqual(['third', 'second', 'first']);
    expect(result.success).toBe(true);
  });

  it('times out and reports timed out handlers', async () => {
    manager.register('slow', async () => { await new Promise((r) => setTimeout(r, 200)); order.push('slow'); });
    manager.register('fast', async () => { order.push('fast'); });
    const result = await manager.shutdown(100);
    expect(result.timedOutHandlers).toContain('slow');
    expect(order).toEqual(['fast']);
  });

  it('prevents concurrent shutdown', async () => {
    manager.register('a', async () => { await new Promise((r) => setTimeout(r, 50)); order.push('a'); });
    const [r1, r2] = await Promise.all([manager.shutdown(500), manager.shutdown(500)]);
    expect(r1.success).toBe(false || r2.success === false);
  });
});
