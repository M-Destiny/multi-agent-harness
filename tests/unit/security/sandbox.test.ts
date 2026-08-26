import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SandboxRegistry } from '../../../src/core/security/index.js';
import { SubAgent } from '../../../src/core/sub-agent.js';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import * as cp from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

describe('Sandbox Security Layer', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
    vi.resetAllMocks();
  });

  it('resolves registered sandbox providers', () => {
    const docker = SandboxRegistry.get('docker');
    const e2b = SandboxRegistry.get('e2b');
    const modal = SandboxRegistry.get('modal');

    expect(docker).toBeDefined();
    expect(e2b).toBeDefined();
    expect(modal).toBeDefined();
  });

  it('DockerSandboxSession lifecycle', async () => {
    const mockExec = cp.exec as unknown as ReturnType<typeof vi.fn>;
    mockExec.mockImplementation((cmd, options, cb) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, { stdout: 'output', stderr: '' });
    });

    const docker = SandboxRegistry.get('docker')!;
    const session = await docker.createSession({
      cpuLimit: 1,
      memoryLimitMb: 512,
      networkAllowed: false,
    });

    expect(session.id).toBeDefined();
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker run -d --name harness-sandbox-'),
      expect.any(Function)
    );

    const res = await session.executeCommand('echo "test"', '/app');
    expect(res.success).toBe(true);
    expect(res.output).toContain('output');

    await session.writeFile('/app/file.txt', 'hello');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker exec'),
      expect.any(Function)
    );

    await session.close();
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker rm -f'),
      expect.any(Function)
    );
  });

  it('agent spawns and closes sandbox', async () => {
    const mockExec = cp.exec as unknown as ReturnType<typeof vi.fn>;
    mockExec.mockImplementation((cmd, options, cb) => {
      const callback = typeof options === 'function' ? options : cb;
      callback(null, { stdout: 'ok', stderr: '' });
    });

    const agent = new SubAgent({
      id: 'worker-1',
      name: 'Worker',
      role: 'sub',
      capabilities: ['code'],
      tools: [],
      memoryNamespace: 'test',
      llmConfig: { provider: 'openai', model: 'gpt-4o', apiKey: 'test' },
      systemPrompt: '',
      maxRetries: 1,
      timeoutMs: 5000,
      sandbox: {
        enabled: true,
        provider: 'docker',
      },
    }, store);

    await agent.initialize();
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker run -d'),
      expect.any(Function)
    );

    await agent.shutdown();
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('docker rm -f'),
      expect.any(Function)
    );
  });
});
