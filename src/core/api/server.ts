import { fastify } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { Checkpointer, Workflow } from '../types.js';
import EventEmitter from 'node:events';
import { TenantManager } from '../auth/keys.js';
import { AuditLogger } from '../logging/audit.js';
import { hasPermission, type Permission, type UserRole } from '../auth/rbac.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ApiServer {
  private app = fastify();
  private readonly events = new EventEmitter();
  private activeWorkflow: Workflow | null = null;
  public readonly tenantManager: TenantManager;
  public readonly auditLogger: AuditLogger;

  constructor(
    private readonly checkpointer: Checkpointer,
    private readonly port = 3000,
    tenantsDbPath?: string,
    auditDbPath?: string
  ) {
    this.tenantManager = new TenantManager(tenantsDbPath);
    this.auditLogger = new AuditLogger(auditDbPath);
  }

  broadcast(event: unknown): void {
    this.events.emit('log', event);
  }

  setWorkflow(workflow: Workflow): void {
    this.activeWorkflow = workflow;
  }

  private async authenticate(req: FastifyRequest, reply: FastifyReply, requiredPermission?: Permission): Promise<{ tenantId: string; role: UserRole } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      return null;
    }

    const token = authHeader.substring(7);

    // Simulate OIDC token verification for mock SSO
    if (token.startsWith('sso_')) {
      return { tenantId: 'default', role: 'admin' };
    }

    const keyInfo = await this.tenantManager.validateApiKey(token);
    if (!keyInfo) {
      reply.status(401).send({ error: 'Invalid API Key' });
      return null;
    }

    if (requiredPermission && !hasPermission(keyInfo.role, requiredPermission)) {
      reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
      return null;
    }

    return { tenantId: keyInfo.tenantId, role: keyInfo.role };
  }

  async start(): Promise<string> {
    await this.app.register(fastifyStatic, {
      root: __dirname,
      index: false,
    });

    await this.app.register(fastifyWebsocket);

    // Serve studio UI
    this.app.get('/studio', async (_req, reply) => {
      return reply.sendFile('studio.html');
    });

    // OIDC SSO Mockup endpoints
    this.app.get('/api/auth/oidc/login', async (_req, reply) => {
      return reply.redirect('/api/auth/oidc/callback?code=mock_code');
    });

    this.app.get('/api/auth/oidc/callback', async (_req, _reply) => {
      return { access_token: 'sso_mock_token_123', token_type: 'Bearer', expires_in: 3600 };
    });

    // Tenant / Keys CRUD
    this.app.post('/api/tenants', async (req, _reply) => {
      const { id, name } = req.body as { id: string; name: string };
      const tenant = await this.tenantManager.createTenant(id, name);
      await this.auditLogger.log({
        tenantId: id,
        userId: 'system',
        action: 'create',
        resource: 'tenant',
        details: `Tenant ${name} created`,
      });
      return tenant;
    });

    this.app.post('/api/tenants/:tenantId/keys', async (req, _reply) => {
      const { tenantId } = req.params as { tenantId: string };
      const { role, description } = req.body as { role: UserRole; description: string };
      const key = await this.tenantManager.createApiKey(tenantId, role, description);
      await this.auditLogger.log({
        tenantId,
        userId: 'admin',
        action: 'create',
        resource: 'api_key',
        details: `API key created with role ${role}`,
      });
      return key;
    });

    this.app.get('/api/audit-logs', async (req, reply) => {
      const auth = await this.authenticate(req, reply, 'admin:keys');
      if (!auth) return;
      return this.auditLogger.query(auth.tenantId);
    });

    // WebSockets endpoint
    this.app.get('/api/stream', { websocket: true }, (connection) => {
      const logListener = (data: unknown) => {
        connection.socket.send(JSON.stringify(data));
      };
      this.events.on('log', logListener);
      connection.socket.on('close', () => {
        this.events.off('log', logListener);
      });
    });

    // REST endpoints with Auth & Audit Logging
    this.app.get('/api/graph', async (req, reply) => {
      const auth = await this.authenticate(req, reply, 'read:graph');
      if (!auth) return;
      
      if (!this.activeWorkflow) {
        return { nodes: [], edges: [] };
      }
      const nodes = this.activeWorkflow.tasks.map(t => ({ id: t.id, name: t.name }));
      const edges: { source: string; target: string }[] = [];
      this.activeWorkflow.tasks.forEach(t => {
        if (t.dependencies) {
          t.dependencies.forEach(dep => {
            edges.push({ source: dep, target: t.id });
          });
        }
      });
      return { nodes, edges };
    });

    this.app.get('/api/checkpoints', async (req, reply) => {
      const auth = await this.authenticate(req, reply, 'read:checkpoints');
      if (!auth) return;

      const { threadId } = req.query as { threadId?: string };
      if (!threadId) {
        return reply.status(400).send({ error: 'Missing threadId query parameter' });
      }
      return this.checkpointer.list(threadId);
    });

    this.app.post('/api/checkpoints/:checkpointId/resume', async (req, reply) => {
      const auth = await this.authenticate(req, reply, 'write:state');
      if (!auth) return;

      const { checkpointId } = req.params as { checkpointId: string };
      const { threadId } = req.query as { threadId?: string };
      const { state } = req.body as { state: unknown };

      if (!threadId) {
        return reply.status(400).send({ error: 'Missing threadId query parameter' });
      }

      const cp = await this.checkpointer.get(threadId, checkpointId);
      if (!cp) {
        return reply.status(404).send({ error: 'Checkpoint not found' });
      }

      cp.state = state;
      cp.createdAt = new Date();
      await this.checkpointer.put(cp);

      await this.auditLogger.log({
        tenantId: auth.tenantId,
        userId: 'user',
        action: 'resume',
        resource: `checkpoint:${checkpointId}`,
        details: 'Workflow execution resumed with state modification',
      });

      this.broadcast({
        type: 'resume',
        timestamp: new Date(),
        message: `Resuming execution from checkpoint ${checkpointId} with modified state.`,
      });

      return { success: true };
    });

    const url = await this.app.listen({ port: this.port, host: '0.0.0.0' });
    return url;
  }

  async stop(): Promise<void> {
    await this.app.close();
    this.tenantManager.close();
    this.auditLogger.close();
  }
}
