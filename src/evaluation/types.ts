export interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
  severity: 'error' | 'warning' | 'info';
}

export interface EvaluationResult {
  passed: boolean;
  score: number;
  checks: CheckResult[];
  summary: string;
}

export interface QualityGate {
  readonly name: string;
  readonly description: string;
  evaluate(taskResult: TaskResult): Promise<CheckResult>;
}

export interface TaskResult {
  output: unknown;
  evaluation?: EvaluationResult;
  artifacts: Artifact[];
}

export interface Artifact {
  type: string;
  name: string;
  path: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluatorConfig {
  gates: QualityGate[];
  minimumScore?: number;
  failFast?: boolean;
}

export interface EvaluatorResult {
  evaluation: EvaluationResult;
  gateResults: GateResult[];
  durationMs: number;
}

export interface GateResult {
  gateName: string;
  check: CheckResult;
  durationMs: number;
  error?: Error;
}
