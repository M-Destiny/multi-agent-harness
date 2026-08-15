import * as fs from 'node:fs';
import type { EvaluatorResult } from './types.js';

export interface Reporter {
  report(result: EvaluatorResult): void;
}

export class ConsoleReporter implements Reporter {
  report(result: EvaluatorResult): void {
    const status = result.evaluation.passed ? 'PASS' : 'FAIL';
    console.log(`\n=== Evaluation: ${status} (score: ${result.evaluation.score}) ===`);
    console.log(`Summary: ${result.evaluation.summary}`);
    for (const gr of result.gateResults) {
      const icon = gr.check.passed ? 'ok' : 'FAIL';
      const sev = gr.check.severity.toUpperCase();
      console.log(`  [${icon}] ${gr.gateName} (${gr.durationMs}ms) [${sev}]`);
      if (!gr.check.passed) console.log(`    ${gr.check.details}`);
    }
    console.log(`Total time: ${result.durationMs}ms\n`);
  }
}

export class JsonReporter implements Reporter {
  report(result: EvaluatorResult): void {
    console.log(JSON.stringify(result, null, 2));
  }

  reportToFile(result: EvaluatorResult, filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
  }
}
