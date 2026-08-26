import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TenantManager } from '../../../src/core/auth/keys.js';
import { AuditLogger } from '../../../src/core/logging/audit.js';
import { ApiServer } from '../../../src/core/api/server.js';
import { SqliteCheckpointer } from '../../../src/core/checkpointer/sqlite.js';

describe('Multi-Tenant Enterprise Security & Logging', () => {
  let manager: TenantManager;
  let logger: AuditLogger;

  beforeEach(() => {
    manager = new TenantManager(':memory:');
    logger = new AuditLogger(':memory:');
  });

  afterEach(() => {
    manager.close();
    logger.close();
  });

  it('TenantManager can create tenants and validate roles on keys', async () => {
    await manager.createTenant('t-corp', 'Corp Tenant');
    const tenant = await manager.getTenant('t-corp');
    expect(tenant?.name).toBe('Corp Tenant');

    const keyInfo = await manager.createApiKey('t-corp', 'developer', 'Dev Key');
    expect(keyInfo.key).toContain('hk_');

    const validated = await manager.validateApiKey(keyInfo.key);
    expect(validated?.role).toBe('developer');
    expect(validated?.tenantId).toBe('t-corp');

    const list = await manager.listApiKeys('t-corp');
    expect(list).toHaveLength(1);

    await manager.revokeApiKey(keyInfo.key);
    const validated2 = await manager.validateApiKey(keyInfo.key);
    expect(validated2).toBeNull();
  });

  it('AuditLogger records and queries log entries', async () => {
    await logger.log({
      tenantId: 't-corp',
      userId: 'user-1',
      action: 'execute',
      resource: 'workflow',
      details: 'Started pipeline test',
    });

    const entries = await logger.query('t-corp');
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe('user-1');
    expect(entries[0].action).toBe('execute');
  });
});

describe('ApiServer Multi-Tenant Auth Middleware', () => {
  let checkpointer: SqliteCheckpointer;
  let server: ApiServer;
  let baseUrl: string;

  beforeEach(async () => {
    checkpointer = new SqliteCheckpointer(':memory:');
    server = new ApiServer(checkpointer, 0, ':memory:', ':memory:');
    baseUrl = await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('OIDC / SSO simulated endpoints login and callback exchange', async () => {
    const res = await fetch(`${baseUrl}/api/auth/oidc/login`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/api/auth/oidc/callback');

    const callbackRes = await fetch(`${baseUrl}/api/auth/oidc/callback`);
    const data = await callbackRes.json();
    expect(data.access_token).toBe('sso_mock_token_123');
  });

  it('REST endpoints enforce tenant RBAC permissions', async () => {
    // 1. Create a tenant and API keys
    await server.tenantManager.createTenant('company-a', 'Company A');
    
    // Viewer key: has no write permissions
    const viewerKey = await server.tenantManager.createApiKey('company-a', 'viewer', 'Viewer Key');
    
    // Developer key: has graph read & state write permissions
    const devKey = await server.tenantManager.createApiKey('company-a', 'developer', 'Dev Key');

    // 2. Fetch /api/graph without auth -> 401
    const resNoAuth = await fetch(`${baseUrl}/api/graph`);
    expect(resNoAuth.status).toBe(401);

    // 3. Fetch /api/graph with viewer key -> 200 (viewer has read:graph)
    const resViewer = await fetch(`${baseUrl}/api/graph`, {
      headers: { Authorization: `Bearer ${viewerKey.key}` }
    });
    expect(resViewer.status).toBe(200);

    // 4. Try posting resume without write permissions -> 403
    const resViewerResume = await fetch(`${baseUrl}/api/checkpoints/cp-1/resume?threadId=th-1`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${viewerKey.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ state: {} })
    });
    expect(resViewerResume.status).toBe(403);
  });
});
