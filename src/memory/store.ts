export interface MemorySnapshot {
  entries: Array<{
    namespace: string;
    key: string;
    value: unknown;
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
  }>;
  timestamp: number;
}

export interface MemoryStore {
  get(namespace: string, key: string): Promise<unknown | null>;
  set(namespace: string, key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list(namespace: string, prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
  snapshot(): Promise<MemorySnapshot>;
  restore(snapshot: MemorySnapshot): Promise<void>;
}
