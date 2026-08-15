import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { CheckResult, QualityGate, TaskResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../../..');

abstract class CommandGate implements QualityGate {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly command: string;
  abstract readonly args: string[];
  readonly cwd = PROJECT_ROOT;

  async evaluate(_taskResult: TaskResult): Promise<CheckResult> {
    const start = Date.now();
    try {
      const { stdout, stderr, exitCode } = await this.exec();
      const ms = Date.now() - start;
      if (exitCode === 0) return { name: this.name, passed: true, details: `Passed in ${ms}ms\n${stdout}`, severity: 'info' };
      return { name: this.name, passed: false, details: `Failed in ${ms}ms (exit ${exitCode})\n${stderr}\n${stdout}`, severity: 'error' };
    } catch (e) {
      const ms = Date.now() - start;
      return { name: this.name, passed: false, details: `Error after ${ms}ms: ${e instanceof Error ? e.message : String(e)}`, severity: 'error' };
    }
  }

  protected exec(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((res) => {
      const child = spawn(this.command, this.args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => res({ stdout, stderr, exitCode: code ?? 1 }));
      child.on('error', () => res({ stdout, stderr, exitCode: 1 }));
    });
  }
}

export class TypeCheckGate extends CommandGate {
  readonly name = 'typecheck';
  readonly description = 'TypeScript type checking (tsc --noEmit)';
  readonly command = 'npx';
  readonly args = ['tsc', '--noEmit'];
}

export class LintGate extends CommandGate {
  readonly name = 'lint';
  readonly description = 'ESLint code linting';
  readonly command = 'npx';
  readonly args = ['eslint', 'src', '--ext', '.ts', '--format', 'unix'];
}

export class TestGate extends CommandGate {
  readonly name = 'test';
  readonly description = 'Vitest unit tests';
  readonly command = 'npx';
  readonly args = ['vitest', 'run', '--reporter=verbose'];
}

export class CoverageGate extends CommandGate {
  readonly name = 'coverage';
  readonly description = 'Code coverage thresholds';
  readonly command = 'npx';
  readonly args = ['vitest', 'run', '--coverage', '--reporter=verbose'];

  override async evaluate(_taskResult: TaskResult): Promise<CheckResult> {
    const start = Date.now();
    try {
      const { stdout, stderr, exitCode } = await this.exec();
      const ms = Date.now() - start;
      const lines = stdout.split('\n');
      const covLines = lines.filter((l) => l.includes('%') && /(Lines|Functions|Branches|Statements)/.test(l));
      const thresholds = { lines: 80, functions: 80, branches: 70, statements: 80 };
      const results: Record<string, { value: number; threshold: number; passed: boolean }> = {};
      for (const line of covLines) {
        const m = line.match(/(Lines|Functions|Branches|Statements)\s+:?\s+([\d.]+)%/);
        if (m && m[1] && m[2]) {
          const key = m[1].toLowerCase() as keyof typeof thresholds;
          const val = parseFloat(m[2]);
          results[key] = { value: val, threshold: thresholds[key], passed: val >= thresholds[key] };
        }
      }
      const allPassed = Object.values(results).every((r) => r.passed);
      const details = Object.entries(results).map(([k, v]) => `${k}: ${v.value}% (need ${v.threshold}%) ${v.passed ? 'ok' : 'FAIL'}`).join('\n');
      if (exitCode === 0 && allPassed) return { name: this.name, passed: true, details: `Coverage met in ${ms}ms\n${details}`, severity: 'info' };
      return { name: this.name, passed: false, details: `Coverage failed in ${ms}ms\n${details}\n${stderr}`, severity: 'error' };
    } catch (e) {
      const ms = Date.now() - start;
      return { name: this.name, passed: false, details: `Error after ${ms}ms: ${e instanceof Error ? e.message : String(e)}`, severity: 'error' };
    }
  }
}

export function createBuiltInGates(): QualityGate[] {
  return [new TypeCheckGate(), new LintGate(), new TestGate(), new CoverageGate()];
}
