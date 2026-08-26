import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { UserRole } from './rbac.js';

export interface Tenant {
  id: string;
  name: string;
  createdAt: number;
}

export interface ApiKey {
  key: string;
  tenantId: string;
  role: UserRole;
  description: string;
  createdAt: number;
}

export class TenantManager {
  private db: Database.Database;

  constructor(dbPath = './.harness/tenants.db') {
    const dir = dirname(resolve(dbPath));
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(tenant_id) REFERENCES tenants(id)
      );
    `);
  }

  async createTenant(id: string, name: string): Promise<Tenant> {
    const stmt = this.db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)');
    const createdAt = Date.now();
    stmt.run(id, name, createdAt);
    return { id, name, createdAt };
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ?');
    const row = stmt.get(id) as { id: string; name: string; created_at: number } | undefined;
    return row ? { id: row.id, name: row.name, createdAt: row.created_at } : null;
  }

  async createApiKey(tenantId: string, role: UserRole, description: string): Promise<ApiKey> {
    const key = 'hk_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const createdAt = Date.now();
    const stmt = this.db.prepare('INSERT INTO api_keys (key, tenant_id, role, description, created_at) VALUES (?, ?, ?, ?, ?)');
    stmt.run(key, tenantId, role, description, createdAt);
    return { key, tenantId, role, description, createdAt };
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key = ?');
    const row = stmt.get(key) as { key: string; tenant_id: string; role: string; description: string; created_at: number } | undefined;
    return row ? {
      key: row.key,
      tenantId: row.tenant_id,
      role: row.role as UserRole,
      description: row.description,
      createdAt: row.created_at,
    } : null;
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE tenant_id = ?');
    const rows = stmt.all(tenantId) as { key: string; tenant_id: string; role: string; description: string; created_at: number }[];
    return rows.map(row => ({
      key: row.key,
      tenantId: row.tenant_id,
      role: row.role as UserRole,
      description: row.description,
      createdAt: row.created_at,
    }));
  }

  async revokeApiKey(key: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM api_keys WHERE key = ?');
    stmt.run(key);
  }

  close(): void {
    this.db.close();
  }
}
