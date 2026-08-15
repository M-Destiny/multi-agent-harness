import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(command: string, args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd ?? process.cwd(),
      timeout: options.timeout ?? 600_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.code ?? 1 };
  }
}

export class SpecKitCommands {
  constructor(
    private readonly cliPath: string = 'specify',
    private readonly projectRoot: string = '.',
    private readonly timeoutMs: number = 600_000,
  ) {}

  async constitution(principles: string): Promise<CommandResult> {
    return runCommand(this.cliPath, ['constitution', '--principles', principles], { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async specify(description: string): Promise<CommandResult> {
    return runCommand(this.cliPath, ['specify', description], { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async plan(specPath?: string): Promise<CommandResult> {
    const args = specPath ? ['plan', '--spec', specPath] : ['plan'];
    return runCommand(this.cliPath, args, { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async tasks(planPath?: string): Promise<CommandResult> {
    const args = planPath ? ['tasks', '--plan', planPath] : ['tasks'];
    return runCommand(this.cliPath, args, { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async implement(tasksPath?: string): Promise<CommandResult> {
    const args = tasksPath ? ['implement', '--tasks', tasksPath] : ['implement'];
    return runCommand(this.cliPath, args, { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async verify(): Promise<CommandResult> {
    return runCommand(this.cliPath, ['verify'], { cwd: this.projectRoot, timeout: this.timeoutMs });
  }

  async converge(): Promise<CommandResult> {
    return runCommand(this.cliPath, ['converge'], { cwd: this.projectRoot, timeout: this.timeoutMs });
  }
}
