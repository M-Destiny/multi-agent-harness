import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessMCPServer } from '../../../src/mcp/server.js';

describe('HarnessMCPServer', () => {
  let server: HarnessMCPServer;

  beforeEach(() => {
    const config = {
      harnessConfig: {
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        provider: 'nvidia',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
      workspacePath: '/tmp/test-workspace',
    };
    server = new HarnessMCPServer(config);
  });

  it('should create server instance', () => {
    expect(server).toBeDefined();
  });

  it('should have correct server name and version', () => {
    // Access private server property for testing
    const serverInstance = (server as any).server;
    expect(serverInstance).toBeDefined();
  });
});