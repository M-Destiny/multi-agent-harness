import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { MemorySnapshot, MemoryStore } from './store.js';

interface Row {
  namespace: string;
  key: string;
  value_json: string;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export class SqliteStore implements MemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (namespace, key)
      );
    `);
  }

  private purge(): void {
    this.db.prepare('DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
  }

  async get(namespace: string, key: string): Promise<unknown | null> {
    this.purge();
    const row = this.db.prepare('SELECT * FROM memory WHERE namespace = ? AND key = ?').get(namespace, key) as Row | undefined;
    return row ? JSON.parse(row.value_json) : null;
  }

  async set(namespace: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    const now = Date.now();
    const existing = this.db.prepare('SELECT created_at FROM memory WHERE namespace = ? AND key = ?').get(namespace, key) as { created_at: number } | undefined;
    this.db.prepare(`
      INSERT INTO memory (namespace, key, value_json, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `).run(namespace, key, JSON.stringify(value), existing?.created_at ?? now, now, ttlMs !== undefined ? now + ttlMs : null);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.db.prepare('DELETE FROM memory WHERE namespace = ? AND key = ?').run(namespace, key);
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    this.purge();
    if (prefix) {
      return (this.db.prepare('SELECT key FROM memory WHERE namespace = ? AND key LIKE ?').all(namespace, `${prefix}%`) as Array<{ key: string }>).map((r) => r.key);
    }
    return (this.db.prepare('SELECT key FROM memory WHERE namespace = ?').all(namespace) as Array<{ key: string }>).map((r) => r.key);
  }

  async clear(namespace: string): Promise<void> {
    this.db.prepare('DELETE FROM memory WHERE namespace = ?').run(namespace);
  }

  async snapshot(): Promise<MemorySnapshot> {
    this.purge();
    const rows = this.db.prepare('SELECT * FROM memory').all() as Row[];
    return {
      entries: rows.map((r) => ({ namespace: r.namespace, key: r.key, value: JSON.parse(r.value_json), createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at ?? undefined })),
      timestamp: Date.now(),
    };
  }

  async restore(snapshot: MemorySnapshot): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory').run();
      const stmt = this.db.prepare('INSERT INTO memory (namespace, key, value_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of snapshot.entries) stmt.run(e.namespace, e.key, JSON.stringify(e.value), e.createdAt, e.updatedAt, e.expiresAt ?? null);
    });
    tx();
  }

  close(): void {
    this.db.close();
  }
}
