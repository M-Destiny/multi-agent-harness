import { describe, expect, it } from 'vitest';
import { InMemoryVectorStore, cosineSimilarity, getLocalEmbedding } from '../../../src/core/memory/vector.js';

describe('Vector Memory Store & Semantic Search', () => {
  it('computes cosine similarity accurately', () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const v3 = [1, 0, 0];
    
    expect(cosineSimilarity(v1, v2)).toBe(0);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(1.0, 5);
  });

  it('generates local embeddings dynamically', () => {
    const emb1 = getLocalEmbedding('hello world test');
    const emb2 = getLocalEmbedding('hello world test');
    const emb3 = getLocalEmbedding('completely different text');

    expect(emb1).toHaveLength(128);
    expect(cosineSimilarity(emb1, emb2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(emb1, emb3)).toBeLessThan(0.5);
  });

  it('InMemoryVectorStore supports KV and semantic vector search', async () => {
    const store = new InMemoryVectorStore();

    // Test simple KV
    await store.set('ns-1', 'k1', 'AI agent coding harness');
    const val = await store.get('ns-1', 'k1');
    expect(val).toBe('AI agent coding harness');

    // Test automatic vector registration on string set
    const matches = await store.queryVector('ns-1', {
      text: 'agent harness coding',
      limit: 1,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('k1');
  });

  it('supports metadata filtering and consolidation', async () => {
    const store = new InMemoryVectorStore();

    await store.addVector('ns-2', {
      id: 'doc-1',
      vector: getLocalEmbedding('NodeJS backend Fastify REST API'),
      text: 'NodeJS backend Fastify REST API',
      metadata: { tag: 'backend', priority: 'high' },
    });

    await store.addVector('ns-2', {
      id: 'doc-2',
      vector: getLocalEmbedding('React frontend Tailwind component UI'),
      text: 'React frontend Tailwind component UI',
      metadata: { tag: 'frontend' },
    });

    // Semantic query with metadata filter
    const matches = await store.queryVector('ns-2', {
      text: 'api endpoint developer',
      metadataFilter: { tag: 'backend' },
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('doc-1');

    // Test Consolidation
    await store.consolidate('ns-2');
    const list = await store.list('ns-2');
    // KV is cleared, only consolidated summary should remain in vector database
    const matchesConsolidated = await store.queryVector('ns-2', {
      text: 'consolidated summary NodeJS React',
    });
    expect(matchesConsolidated).toHaveLength(1);
    expect(matchesConsolidated[0].id).toBe('consolidated_summary');
  });
});
