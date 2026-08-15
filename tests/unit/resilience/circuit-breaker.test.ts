import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../../src/core/resilience/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
  });

  it('CLOSED: calls succeed and reset failures', async () => {
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('OPEN: fails fast without calling fn', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);
    const start = Date.now();
    await expect(cb.execute(async () => 'ok')).rejects.toThrow('Circuit breaker is OPEN');
    expect(Date.now() - start).toBeLessThan(50); // should be instant
  });

  it('HALF_OPEN: success transitions to CLOSED', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);
    // Wait for reset
    await new Promise((r) => setTimeout(r, 1100));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('HALF_OPEN: failure transitions back to OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    }
    await new Promise((r) => setTimeout(r, 1100));
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    await expect(cb.execute(async () => { throw new Error('still failing'); })).rejects.toThrow('still failing');
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('onStateChange callback fires', async () => {
    const states: CircuitState[] = [];
    cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 500, onStateChange: (s) => states.push(s) });
    await expect(cb.execute(async () => { throw new Error('f1'); })).rejects.toThrow('f1');
    await expect(cb.execute(async () => { throw new Error('f2'); })).rejects.toThrow('f2');
    expect(states).toContain(CircuitState.OPEN);
  });
});
