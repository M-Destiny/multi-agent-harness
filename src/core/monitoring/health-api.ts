import http from 'node:http';

export interface HealthServerOptions {
  port?: number;
  readinessCheck?: () => boolean | Promise<boolean>;
  checks?: Record<string, () => string | Promise<string>>;
}

export class HealthServer {
  private server?: http.Server;
  private readonly port: number;
  private readonly readinessCheck?: () => boolean | Promise<boolean>;
  private readonly checks: Record<string, () => string | Promise<string>>;
  private ready = false;

  constructor(options: HealthServerOptions = {}) {
    this.port = options.port ?? 8080;
    this.readinessCheck = options.readinessCheck;
    this.checks = options.checks ?? {};
  }

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      const url = req.url ?? '/';

      if (url === '/health') {
        await this.writeJson(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          checks: await this.runChecks(),
        });
        return;
      }

      if (url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' });
        res.end('');
        return;
      }

      if (url === '/ready') {
        const isReady = this.readinessCheck ? await this.readinessCheck() : this.ready;
        if (isReady) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ready":true}');
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end('{"ready":false}');
        }
        return;
      }

      if (url === '/live') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"alive":true}');
        return;
      }

      res.writeHead(404);
      res.end('{"error":"not found"}');
    });

    await new Promise<void>((resolve) => this.server!.listen(this.port, resolve));
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => this.server?.close(() => resolve()));
  }

  private async runChecks(): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    for (const [name, fn] of Object.entries(this.checks)) {
      try { results[name] = await fn(); }
      catch { results[name] = 'error'; }
    }
    return results;
  }

  private async writeJson(res: http.ServerResponse, status: number, body: unknown): Promise<void> {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(json);
  }
}
