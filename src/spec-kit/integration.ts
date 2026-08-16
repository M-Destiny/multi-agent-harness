import { SpecKitCommands } from './commands.js';
import type { CommandResult } from './commands.js';

export interface ConstitutionResult { success: boolean; output: string; }
export interface SpecResult { success: boolean; specPath?: string; output: string; }
export interface PlanResult { success: boolean; planPath?: string; output: string; }
export interface TasksResult { success: boolean; tasksPath?: string; output: string; }
export interface ImplementResult { success: boolean; output: string; }
export interface VerifyResult { success: boolean; checks: string[]; output: string; }
export interface ConvergeResult { success: boolean; remainingWork: string[]; output: string; }

export class SpecKitIntegration {
  private readonly commands: SpecKitCommands;

  constructor(cliPath?: string, projectRoot?: string, timeoutMs?: number) {
    this.commands = new SpecKitCommands(cliPath, projectRoot, timeoutMs);
  }

  async createConstitution(principles: string): Promise<ConstitutionResult> {
    const res = await this.commands.constitution(principles);
    return { success: res.exitCode === 0, output: res.stdout + res.stderr };
  }

  async specifyFeature(description: string): Promise<SpecResult> {
    const res = await this.commands.specify(description);
    return { success: res.exitCode === 0, output: res.stdout + res.stderr };
  }

  async generatePlan(specPath?: string): Promise<PlanResult> {
    const res = await this.commands.plan(specPath);
    return { success: res.exitCode === 0, output: res.stdout + res.stderr };
  }

  async generateTasks(planPath?: string): Promise<TasksResult> {
    const res = await this.commands.tasks(planPath);
    return { success: res.exitCode === 0, output: res.stdout + res.stderr };
  }

  async implement(tasksPath?: string): Promise<ImplementResult> {
    const res = await this.commands.implement(tasksPath);
    return { success: res.exitCode === 0, output: res.stdout + res.stderr };
  }

  async verify(): Promise<VerifyResult> {
    const res = await this.commands.verify();
    const checks = res.stdout.split('\n').filter((l) => l.trim().length > 0);
    return { success: res.exitCode === 0, checks, output: res.stdout + res.stderr };
  }

  async converge(): Promise<ConvergeResult> {
    const res = await this.commands.converge();
    const remainingWork = res.stdout.split('\n').filter((l: string) => l.trim().length > 0);
    return { success: res.exitCode === 0, remainingWork, output: res.stdout + res.stderr };
  }

  async runFullLoop(description: string, principles?: string): Promise<void> {
    if (principles) {
      const c = await this.createConstitution(principles);
      if (!c.success) throw new Error(`Constitution failed: ${c.output}`);
    }
    const spec = await this.specifyFeature(description);
    if (!spec.success) throw new Error(`Specify failed: ${spec.output}`);
    const plan = await this.generatePlan();
    if (!plan.success) throw new Error(`Plan failed: ${plan.output}`);
    const tasks = await this.generateTasks();
    if (!tasks.success) throw new Error(`Tasks failed: ${tasks.output}`);
    const impl = await this.implement();
    if (!impl.success) throw new Error(`Implement failed: ${impl.output}`);
    const verify = await this.verify();
    if (!verify.success) throw new Error(`Verify failed: ${verify.output}`);
  }
}
