import type { MemorySnapshot, MemoryStore } from './store.js';

interface StoredEntry {
  value: unknown;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export class InMemoryStore implements MemoryStore {
  private readonly data = new Map<string, Map<string, StoredEntry>>();

  private ensureNamespace(ns: string): Map<string, StoredEntry> {
    let m = this.data.get(ns);
    if (!m) { m = new Map(); this.data.set(ns, m); }
    return m;
  }

  private purge(ns: string): void {
    const m = this.data.get(ns);
    if (!m) return;
    const now = Date.now();
    for (const [k, e] of m) if (e.expiresAt !== undefined && e.expiresAt <= now) m.delete(k);
  }

  async get(namespace: string, key: string): Promise<unknown | null> {
    this.purge(namespace);
    return this.data.get(namespace)?.get(key)?.value ?? null;
  }

  async set(namespace: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    const m = this.ensureNamespace(namespace);
    const prev = m.get(key);
    const now = Date.now();
    m.set(key, { value, createdAt: prev?.createdAt ?? now, updatedAt: now, expiresAt: ttlMs !== undefined ? now + ttlMs : undefined });
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.data.get(namespace)?.delete(key);
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    this.purge(namespace);
    const keys = Array.from(this.data.get(namespace)?.keys() ?? []);
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }

  async clear(namespace: string): Promise<void> {
    this.data.delete(namespace);
  }

  async snapshot(): Promise<MemorySnapshot> {
    const entries: MemorySnapshot['entries'] = [];
    for (const [ns, m] of this.data) for (const [k, e] of m) entries.push({ namespace: ns, key: k, value: e.value, createdAt: e.createdAt, updatedAt: e.updatedAt, expiresAt: e.expiresAt });
    return { entries, timestamp: Date.now() };
  }

  async restore(snapshot: MemorySnapshot): Promise<void> {
    this.data.clear();
    for (const e of snapshot.entries) {
      const m = this.ensureNamespace(e.namespace);
      m.set(e.key, { value: e.value, createdAt: e.createdAt, updatedAt: e.updatedAt, expiresAt: e.expiresAt });
    }
  }
}
