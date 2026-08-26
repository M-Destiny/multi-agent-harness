import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface AuditLogEntry {
  id?: number;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  details: string;
  timestamp: number;
}

export class AuditLogger {
  private db: Database.Database;

  constructor(dbPath = './.harness/audit.db') {
    const dir = dirname(resolve(dbPath));
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_id ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `);
  }

  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, resource, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(entry.tenantId, entry.userId, entry.action, entry.resource, entry.details, Date.now());
  }

  async query(tenantId: string, limit = 50): Promise<AuditLogEntry[]> {
    const stmt = this.db.prepare('SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT ?');
    const rows = stmt.all(tenantId, limit) as { id: number; tenant_id: string; user_id: string; action: string; resource: string; details: string; timestamp: number }[];
    return rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      details: row.details,
      timestamp: row.timestamp,
    }));
  }

  close(): void {
    this.db.close();
  }
}
