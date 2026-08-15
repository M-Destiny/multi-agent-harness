import type { CheckResult, EvaluatorConfig, EvaluatorResult, EvaluationResult, GateResult, QualityGate, TaskResult } from './types.js';

export class Evaluator {
  private readonly gates: QualityGate[];
  private readonly minimumScore: number;
  private readonly failFast: boolean;

  constructor(config: EvaluatorConfig) {
    this.gates = config.gates;
    this.minimumScore = config.minimumScore ?? 0;
    this.failFast = config.failFast ?? false;
  }

  async evaluate(taskResult: TaskResult): Promise<EvaluatorResult> {
    const start = Date.now();
    const gateResults: GateResult[] = [];

    for (const gate of this.gates) {
      const gateStart = Date.now();
      try {
        const check = await gate.evaluate(taskResult);
        const gr: GateResult = { gateName: gate.name, check, durationMs: Date.now() - gateStart };
        gateResults.push(gr);
        if (!check.passed && this.failFast) break;
      } catch (e) {
        const check: CheckResult = { name: gate.name, passed: false, details: String(e), severity: 'error' };
        gateResults.push({ gateName: gate.name, check, durationMs: Date.now() - gateStart, error: e instanceof Error ? e : new Error(String(e)) });
        if (this.failFast) break;
      }
    }

    const passed = gateResults.every((g) => g.check.passed);
    const score = Math.round((gateResults.filter((g) => g.check.passed).length / Math.max(gateResults.length, 1)) * 100);
    const summary = `${gateResults.filter((g) => g.check.passed).length}/${gateResults.length} gates passed (score: ${score})`;

    const evaluation: EvaluationResult = { passed: passed && score >= this.minimumScore, score, checks: gateResults.map((g) => g.check), summary };
    return { evaluation, gateResults, durationMs: Date.now() - start };
  }

  registerGate(gate: QualityGate): void {
    this.gates.push(gate);
  }

  unregisterGate(name: string): void {
    const idx = this.gates.findIndex((g) => g.name === name);
    if (idx >= 0) this.gates.splice(idx, 1);
  }

  listGates(): readonly QualityGate[] {
    return this.gates;
  }
}
