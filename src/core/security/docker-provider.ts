import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SandboxProvider, SandboxSession, SandboxOptions } from './sandbox.js';
import crypto from 'node:crypto';

const execAsync = promisify(exec);

export class DockerSandboxSession implements SandboxSession {
  readonly id: string;
  private readonly containerName: string;
  private readonly image: string;

  constructor(options?: SandboxOptions) {
    this.id = crypto.randomUUID();
    this.containerName = `harness-sandbox-${this.id}`;
    this.image = options?.image ?? 'node:18-alpine';
  }

  async start(options?: SandboxOptions): Promise<void> {
    const limits: string[] = [];
    if (options?.cpuLimit) {
      limits.push(`--cpus=${options.cpuLimit}`);
    }
    if (options?.memoryLimitMb) {
      limits.push(`-m=${options.memoryLimitMb}m`);
    }
    if (options?.networkAllowed === false) {
      limits.push('--network=none');
    }

    // Start a container running in detach mode doing nothing
    const cmd = `docker run -d --name ${this.containerName} ${limits.join(' ')} ${this.image} tail -f /dev/null`;
    await execAsync(cmd);
  }

  async executeCommand(command: string, cwd?: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const workdir = cwd ? `-w ${cwd}` : '';
      const escapedCommand = command.replace(/"/g, '\\"');
      const { stdout, stderr } = await execAsync(`docker exec ${workdir} ${this.containerName} sh -c "${escapedCommand}"`);
      return { success: true, output: stdout + stderr };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        success: false,
        output: (err.stdout ?? '') + (err.stderr ?? ''),
        error: err.message,
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const base64Content = Buffer.from(content).toString('base64');
    const dirIndex = path.lastIndexOf('/');
    if (dirIndex !== -1) {
      const dir = path.substring(0, dirIndex);
      await execAsync(`docker exec ${this.containerName} mkdir -p ${dir}`);
    }
    await execAsync(`docker exec ${this.containerName} sh -c "echo '${base64Content}' | base64 -d > ${path}"`);
  }

  async readFile(path: string): Promise<string> {
    const { stdout } = await execAsync(`docker exec ${this.containerName} cat ${path}`);
    return stdout;
  }

  async close(): Promise<void> {
    try {
      await execAsync(`docker rm -f ${this.containerName}`);
    } catch {
      // Ignore
    }
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly name = 'docker';

  async createSession(options?: SandboxOptions): Promise<SandboxSession> {
    const session = new DockerSandboxSession(options);
    await session.start(options);
    return session;
  }
}
