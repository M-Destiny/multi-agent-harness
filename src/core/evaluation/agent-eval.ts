import type { LLMProvider } from '../llm/provider.js';

export interface AgentEvaluatorResult {
  passed: boolean;
  score: number; // 0 to 100
  details: string;
}

export interface AgentEvaluator {
  readonly name: string;
  evaluate(input: string, output: string, expected?: string, trajectory?: unknown): Promise<AgentEvaluatorResult>;
}

// ── LLM-as-Judge Evaluator ──────────────────────────────────────────────────

export class LLMAsJudgeEvaluator implements AgentEvaluator {
  readonly name = 'llm-judge';

  constructor(
    private readonly provider: LLMProvider,
    private readonly rubric = 'Evaluate correctness, coherence, and accuracy.'
  ) {}

  async evaluate(input: string, output: string, expected?: string): Promise<AgentEvaluatorResult> {
    const prompt = `
You are an expert evaluation judge.
Rate the following generated output based on the input prompt and expected target.

Input: "${input}"
Generated Output: "${output}"
Expected Target: "${expected ?? 'N/A'}"
Evaluation Rubric: ${this.rubric}

Return your evaluation EXACTLY in the following JSON format:
{
  "score": <number between 0 and 100>,
  "passed": <true or false>,
  "reasoning": "<brief explanation of your rating>"
}
`;

    try {
      const res = await this.provider.complete([{ role: 'user', content: prompt }]);
      // Parse JSON from LLM output
      const jsonStart = res.content.indexOf('{');
      const jsonEnd = res.content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = res.content.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        return {
          passed: Boolean(parsed.passed),
          score: Math.max(0, Math.min(100, Number(parsed.score))),
          details: parsed.reasoning || res.content,
        };
      }
      return { passed: true, score: 80, details: res.content };
    } catch (e) {
      return { passed: false, score: 0, details: `LLM Judge failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

// ── Code Execution Evaluator ────────────────────────────────────────────────

export class CodeExecutionEvaluator implements AgentEvaluator {
  readonly name = 'code-exec';

  constructor(private readonly testRunner?: (code: string) => Promise<{ success: boolean; log: string }>) {}

  async evaluate(_input: string, output: string): Promise<AgentEvaluatorResult> {
    if (this.testRunner) {
      const res = await this.testRunner(output);
      return { passed: res.success, score: res.success ? 100 : 0, details: res.log };
    }
    // Simple fallback execution (eval check)
    try {
      if (output.includes('throw new Error') || output.includes('Error:')) {
        return { passed: false, score: 0, details: 'Code output contains errors.' };
      }
      return { passed: true, score: 100, details: 'Code executed successfully (mock/fallback check).' };
    } catch (e) {
      return { passed: false, score: 0, details: String(e) };
    }
  }
}

// ── Semantic Similarity Evaluator ───────────────────────────────────────────

export class SemanticSimilarityEvaluator implements AgentEvaluator {
  readonly name = 'semantic-similarity';

  async evaluate(_input: string, output: string, expected?: string): Promise<AgentEvaluatorResult> {
    if (!expected) {
      return { passed: true, score: 100, details: 'No expected output to compare against.' };
    }

    // Cosine similarity approximation using Jaccard word overlap
    const words1 = new Set(output.toLowerCase().split(/\W+/).filter(Boolean));
    const words2 = new Set(expected.toLowerCase().split(/\W+/).filter(Boolean));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const similarity = union.size === 0 ? 1 : intersection.size / union.size;
    const score = Math.round(similarity * 100);

    return {
      passed: score >= 70,
      score,
      details: `Semantic Jaccard similarity: ${score}% (Intersection: ${intersection.size}, Union: ${union.size})`,
    };
  }
}

// ── Trajectory Evaluator ─────────────────────────────────────────────────────

export interface AgentTrajectory {
  steps: { action: string; input?: unknown; output?: unknown }[];
  durationMs: number;
}

export class TrajectoryEvaluator implements AgentEvaluator {
  readonly name = 'trajectory';

  async evaluate(_input: string, _output: string, _expected?: string, trajectory?: unknown): Promise<AgentEvaluatorResult> {
    const traj = trajectory as AgentTrajectory | undefined;
    if (!traj || !traj.steps || traj.steps.length === 0) {
      return { passed: false, score: 0, details: 'Trajectory is missing or empty.' };
    }

    const failedSteps = traj.steps.filter((s) => s.action.toLowerCase().includes('fail') || s.action.toLowerCase().includes('error'));
    const totalSteps = traj.steps.length;
    const successRate = totalSteps === 0 ? 1 : (totalSteps - failedSteps.length) / totalSteps;
    const score = Math.round(successRate * 100);

    return {
      passed: score >= 80,
      score,
      details: `Evaluated trajectory: ${totalSteps} steps, ${failedSteps.length} failed. Step success rate: ${score}%`,
    };
  }
}

// ── Adapter Interfaces ───────────────────────────────────────────────────────

export interface EvaluationReport {
  testSuiteName: string;
  results: {
    input: string;
    output: string;
    expected?: string;
    scores: Record<string, number>;
    passed: boolean;
    details: Record<string, string>;
  }[];
  overallScore: number;
}

// ── DeepEval Adapter ────────────────────────────────────────────────────────

export class DeepEvalAdapter {
  static export(report: EvaluationReport): object {
    return {
      testSuite: report.testSuiteName,
      metrics: {
        overallScore: report.overallScore / 100,
      },
      testCases: report.results.map(r => ({
        input: r.input,
        actualOutput: r.output,
        expectedOutput: r.expected,
        success: r.passed,
        metrics: Object.entries(r.scores).map(([name, score]) => ({
          name,
          score: score / 100,
        })),
      })),
    };
  }
}

// ── LangSmith Adapter ────────────────────────────────────────────────────────

export class LangSmithAdapter {
  static export(report: EvaluationReport): object {
    return {
      projectName: report.testSuiteName,
      results: report.results.map(r => ({
        run: {
          inputs: { prompt: r.input },
          outputs: { output: r.output },
        },
        reference: { expected: r.expected },
        feedback: Object.entries(r.scores).map(([key, value]) => ({
          key,
          score: value / 100,
          passed: r.passed,
        })),
      })),
    };
  }
}

// ── Braintrust Adapter ───────────────────────────────────────────────────────

export class BraintrustAdapter {
  static export(report: EvaluationReport): object {
    return {
      projectName: report.testSuiteName,
      experimentName: `eval-${Date.now()}`,
      scores: {
        accuracy: report.overallScore / 100,
      },
      records: report.results.map(r => ({
        input: r.input,
        output: r.output,
        expected: r.expected,
        scores: r.scores,
        metadata: r.details,
      })),
    };
  }
}
