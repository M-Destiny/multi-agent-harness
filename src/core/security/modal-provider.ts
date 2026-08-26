import type { SandboxProvider, SandboxSession, SandboxOptions } from './sandbox.js';
import crypto from 'node:crypto';

export class ModalSandboxSession implements SandboxSession {
  readonly id: string;
  private files = new Map<string, string>();

  constructor(_options?: SandboxOptions) {
    this.id = crypto.randomUUID();
  }

  async executeCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
    return { success: true, output: `[Modal Sandbox ${this.id}] Executed: ${command} in ${cwd ?? '/'}` };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string> {
    const file = this.files.get(path);
    if (file === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }

  async close(): Promise<void> {
    this.files.clear();
  }
}

export class ModalSandboxProvider implements SandboxProvider {
  readonly name = 'modal';

  async createSession(options?: SandboxOptions): Promise<SandboxSession> {
    return new ModalSandboxSession(options);
  }
}
