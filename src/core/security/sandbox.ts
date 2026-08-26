export interface SandboxOptions {
  cpuLimit?: number;
  memoryLimitMb?: number;
  timeoutMs?: number;
  networkAllowed?: boolean;
  image?: string;
}

export interface SandboxSession {
  id: string;
  executeCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  close(): Promise<void>;
}

export interface SandboxProvider {
  name: string;
  createSession(options?: SandboxOptions): Promise<SandboxSession>;
}

export class SandboxRegistry {
  private static providers = new Map<string, SandboxProvider>();

  static register(name: string, provider: SandboxProvider): void {
    this.providers.set(name, provider);
  }

  static get(name: string): SandboxProvider | undefined {
    return this.providers.get(name);
  }
}
