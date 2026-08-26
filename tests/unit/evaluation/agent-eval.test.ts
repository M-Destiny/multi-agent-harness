import { describe, expect, it, vi } from 'vitest';
import {
  LLMAsJudgeEvaluator,
  SemanticSimilarityEvaluator,
  CodeExecutionEvaluator,
  TrajectoryEvaluator,
  DeepEvalAdapter,
  LangSmithAdapter,
  BraintrustAdapter,
  type EvaluationReport,
} from '../../../src/core/evaluation/agent-eval.js';
import type { LLMProvider } from '../../../src/core/llm/provider.js';

describe('Agent Evaluation Suite', () => {
  it('LLMAsJudgeEvaluator rates correctly', async () => {
    const mockProvider = {
      name: 'mock',
      config: { provider: 'openai', model: 'gpt-4o', apiKey: 'test' },
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ score: 95, passed: true, reasoning: 'Excellent output' }),
        usage: { totalTokens: 10 },
        model: 'gpt-4o',
      }),
    } as unknown as LLMProvider;

    const judge = new LLMAsJudgeEvaluator(mockProvider);
    const res = await judge.evaluate('prompt', 'actual output', 'expected output');

    expect(res.passed).toBe(true);
    expect(res.score).toBe(95);
    expect(res.details).toBe('Excellent output');
  });

  it('SemanticSimilarityEvaluator compares words Jaccard', async () => {
    const evaluator = new SemanticSimilarityEvaluator();
    const res = await evaluator.evaluate('input', 'hello world test', 'hello world test');
    expect(res.passed).toBe(true);
    expect(res.score).toBe(100);

    const res2 = await evaluator.evaluate('input', 'hello world', 'completely different text');
    expect(res2.passed).toBe(false);
    expect(res2.score).toBeLessThan(50);
  });

  it('CodeExecutionEvaluator runs test codes', async () => {
    const evaluator = new CodeExecutionEvaluator(async (code) => {
      if (code === 'valid') return { success: true, log: 'passed' };
      return { success: false, log: 'failed' };
    });

    const res = await evaluator.evaluate('input', 'valid');
    expect(res.passed).toBe(true);
    expect(res.score).toBe(100);

    const res2 = await evaluator.evaluate('input', 'invalid');
    expect(res2.passed).toBe(false);
    expect(res2.score).toBe(0);
  });

  it('TrajectoryEvaluator analyzes steps', async () => {
    const evaluator = new TrajectoryEvaluator();
    const res = await evaluator.evaluate('input', 'output', 'expected', {
      steps: [
        { action: 'call_tool' },
        { action: 'complete' },
      ],
      durationMs: 100,
    });
    expect(res.passed).toBe(true);
    expect(res.score).toBe(100);

    const res2 = await evaluator.evaluate('input', 'output', 'expected', {
      steps: [
        { action: 'call_tool' },
        { action: 'fail' },
      ],
      durationMs: 100,
    });
    expect(res2.passed).toBe(false);
    expect(res2.score).toBe(50);
  });

  it('Adapters format correctly', () => {
    const report: EvaluationReport = {
      testSuiteName: 'Test Suite',
      overallScore: 90,
      results: [
        {
          input: 'in',
          output: 'out',
          expected: 'exp',
          scores: { judge: 90 },
          passed: true,
          details: { judge: 'ok' },
        },
      ],
    };

    const de = DeepEvalAdapter.export(report);
    expect(de).toHaveProperty('testCases');

    const ls = LangSmithAdapter.export(report);
    expect(ls).toHaveProperty('projectName');

    const bt = BraintrustAdapter.export(report);
    expect(bt).toHaveProperty('experimentName');
  });
});
