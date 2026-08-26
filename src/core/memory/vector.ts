import type { MemoryStore, MemorySnapshot } from './store.js';

export interface VectorEntry {
  id: string;
  vector: number[];
  text: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface VectorQuery {
  vector?: number[];
  text?: string;
  limit?: number;
  minSimilarity?: number;
  metadataFilter?: Record<string, unknown>;
}

export interface VectorMemoryStore extends MemoryStore {
  addVector(namespace: string, entry: Omit<VectorEntry, 'timestamp'>): Promise<void>;
  queryVector(namespace: string, query: VectorQuery): Promise<VectorEntry[]>;
  consolidate(namespace: string): Promise<void>;
}

// Helper: Cosine Similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Simple deterministic local embedding (TF-IDF weight approximation)
export function getLocalEmbedding(text: string, dimension = 128): number[] {
  const embedding = new Array<number>(dimension).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (words.length === 0) return embedding;

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % dimension;
    embedding[index] = (embedding[index] ?? 0) + 1;
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] = (embedding[i] ?? 0) / magnitude;
    }
  }
  return embedding;
}

export class InMemoryVectorStore implements VectorMemoryStore {
  private kv = new Map<string, Map<string, unknown>>();
  private vectors = new Map<string, VectorEntry[]>();

  async get(namespace: string, key: string): Promise<unknown | null> {
    return this.kv.get(namespace)?.get(key) ?? null;
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    let nsMap = this.kv.get(namespace);
    if (!nsMap) {
      nsMap = new Map<string, unknown>();
      this.kv.set(namespace, nsMap);
    }
    nsMap.set(key, value);

    // Auto-embed textual values
    if (typeof value === 'string') {
      await this.addVector(namespace, {
        id: key,
        vector: getLocalEmbedding(value),
        text: value,
        metadata: { source: 'auto-embed' },
      });
    }
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.kv.get(namespace)?.delete(key);
    const list = this.vectors.get(namespace) ?? [];
    this.vectors.set(namespace, list.filter(v => v.id !== key));
  }

  async list(namespace: string, prefix?: string): Promise<string[]> {
    const keys = Array.from(this.kv.get(namespace)?.keys() ?? []);
    if (prefix) return keys.filter(k => k.startsWith(prefix));
    return keys;
  }

  async clear(namespace: string): Promise<void> {
    this.kv.get(namespace)?.clear();
    this.vectors.get(namespace)?.splice(0);
  }

  async snapshot(): Promise<MemorySnapshot> {
    const entries: MemorySnapshot['entries'] = [];
    for (const [ns, map] of this.kv.entries()) {
      for (const [k, v] of map.entries()) {
        entries.push({
          namespace: ns,
          key: k,
          value: v,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
    return { entries, timestamp: Date.now() };
  }

  async restore(snapshot: MemorySnapshot): Promise<void> {
    this.kv.clear();
    this.vectors.clear();
    for (const entry of snapshot.entries) {
      await this.set(entry.namespace, entry.key, entry.value);
    }
  }

  // VectorMemoryStore methods
  async addVector(namespace: string, entry: Omit<VectorEntry, 'timestamp'>): Promise<void> {
    const list = this.vectors.get(namespace) ?? [];
    const fullEntry: VectorEntry = {
      ...entry,
      timestamp: Date.now(),
    };
    // Replace existing if id matches
    const existingIdx = list.findIndex(v => v.id === entry.id);
    if (existingIdx >= 0) {
      list[existingIdx] = fullEntry;
    } else {
      list.push(fullEntry);
    }
    this.vectors.set(namespace, list);
  }

  async queryVector(namespace: string, query: VectorQuery): Promise<VectorEntry[]> {
    const list = this.vectors.get(namespace) ?? [];
    if (list.length === 0) return [];

    let queryVector = query.vector;
    if (!queryVector && query.text) {
      queryVector = getLocalEmbedding(query.text);
    }

    if (!queryVector) return [];

    // Calculate similarities
    const scored = list.map(entry => {
      const sim = cosineSimilarity(queryVector!, entry.vector);
      return { entry, similarity: sim };
    });

    // Filter and Sort
    let filtered = scored;
    if (query.minSimilarity !== undefined) {
      filtered = filtered.filter(s => s.similarity >= query.minSimilarity!);
    }

    if (query.metadataFilter) {
      filtered = filtered.filter(s => {
        for (const [k, v] of Object.entries(query.metadataFilter!)) {
          if (s.entry.metadata?.[k] !== v) return false;
        }
        return true;
      });
    }

    filtered.sort((a, b) => b.similarity - a.similarity);

    const limit = query.limit ?? 10;
    return filtered.slice(0, limit).map(s => s.entry);
  }

  // Memory Consolidation Job: summarizes and compiles old memories into a single consolidated vector
  async consolidate(namespace: string): Promise<void> {
    const list = this.vectors.get(namespace) ?? [];
    if (list.length <= 1) return;

    // Combine all old memory texts
    const combinedText = list.map(v => v.text).join('. ');
    const consolidatedText = `Consolidated Summary: ${combinedText.substring(0, 500)}`;
    const consolidatedVector = getLocalEmbedding(consolidatedText);

    // Clear and put consolidated entry
    await this.clear(namespace);
    await this.addVector(namespace, {
      id: 'consolidated_summary',
      vector: consolidatedVector,
      text: consolidatedText,
      metadata: { type: 'consolidated' },
    });
  }
}
