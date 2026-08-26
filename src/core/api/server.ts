import { fastify } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { Checkpointer, Workflow } from '../types.js';
import EventEmitter from 'node:events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ApiServer {
  private app = fastify();
  private readonly events = new EventEmitter();
  private activeWorkflow: Workflow | null = null;

  constructor(
    private readonly checkpointer: Checkpointer,
    private readonly port = 3000
  ) {}

  broadcast(event: unknown): void {
    this.events.emit('log', event);
  }

  setWorkflow(workflow: Workflow): void {
    this.activeWorkflow = workflow;
  }

  async start(): Promise<string> {
    // Static HTML serving
    await this.app.register(fastifyStatic, {
      root: __dirname,
      index: false,
    });

    // WebSocket support
    await this.app.register(fastifyWebsocket);

    // Serve studio UI at /studio
    this.app.get('/studio', async (_req, reply) => {
      return reply.sendFile('studio.html');
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

    // REST endpoints
    this.app.get('/api/graph', async () => {
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
      const { threadId } = req.query as { threadId?: string };
      if (!threadId) {
        return reply.status(400).send({ error: 'Missing threadId query parameter' });
      }
      return this.checkpointer.list(threadId);
    });

    this.app.post('/api/checkpoints/:checkpointId/resume', async (req, reply) => {
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
  }
}
