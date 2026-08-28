import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Evaluator } from '../../../src/evaluation/runner.ts';
import { TypeCheckGate, LintGate, TestGate } from '../../../src/evaluation/gates.ts';
import type { QualityGate, TaskResult } from '../../../src/evaluation/types.ts';

const passGate: QualityGate = {
  name: 'pass-gate',
  async evaluate(): Promise<{ passed: boolean; details: string }> {
    return { passed: true, details: 'ok' };
  },
};

const failGate: QualityGate = {
  name: 'fail-gate',
  async evaluate(): Promise<{ passed: boolean; details: string }> {
    return { passed: false, details: 'nope', severity: 'error' };
  },
};

const throwingGate: QualityGate = {
  name: 'throw-gate',
  async evaluate(): Promise<{ passed: boolean; details: string }> {
    throw new Error('gate exploded');
  },
};

describe('Evaluator', () => {
  it('passes when all gates pass', async () => {
    const ev = new Evaluator({ gates: [passGate] });
    const result = await ev.evaluate({ output: null, artifacts: [] });
    expect(result.evaluation.passed).toBe(true);
    expect(result.evaluation.score).toBe(100);
  });

  it('fails when any gate fails', async () => {
    const ev = new Evaluator({ gates: [passGate, failGate] });
    const result = await ev.evaluate({ output: null, artifacts: [] });
    expect(result.evaluation.passed).toBe(false);
    expect(result.evaluation.score).toBeLessThan(100);
    expect(result.gateResults.find((g) => g.gateName === 'fail-gate')?.check.passed).toBe(false);
  });

  it('handles gate throwing gracefully', async () => {
    const ev = new Evaluator({ gates: [throwingGate] });
    const result = await ev.evaluate({ output: null, artifacts: [] });
    expect(result.gateResults[0]?.check.passed).toBe(false);
    expect(result.gateResults[0]?.check.details).toContain('gate exploded');
  });

  it('respects failFast option', async () => {
    const ev = new Evaluator({ gates: [failGate, passGate], failFast: true });
    const result = await ev.evaluate({ output: null, artifacts: [] });
    expect(result.gateResults).toHaveLength(1);
    expect(result.gateResults[0]?.gateName).toBe('fail-gate');
  });
});

describe('Built-in gates', () => {
  it('TypeCheckGate, LintGate, TestGate have names', () => {
    expect(new TypeCheckGate().name).toBe('typecheck');
    expect(new LintGate().name).toBe('lint');
    expect(new TestGate().name).toBe('test');
  });
});
