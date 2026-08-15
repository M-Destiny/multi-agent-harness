import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../../../src/core/memory/memory-store.js';
import { createDefaultConfig, loadConfig } from '../../../src/config/loader.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Config loader', () => {
  const tmpdir = os.tmpdir();

  it('createDefaultConfig creates a file and returns its path', () => {
    const filepath = path.join(tmpdir, `harness-test-${Date.now()}.yaml`);
    const result = createDefaultConfig(filepath);
    expect(result).toBe(filepath);
    expect(fs.existsSync(filepath)).toBe(true);
    const content = fs.readFileSync(filepath, 'utf8');
    expect(content).toContain('llm:');
    fs.unlinkSync(filepath);
  });

  it('loadConfig loads a valid YAML config', () => {
    const filepath = path.join(tmpdir, `test-harness-${Date.now()}.yaml`);
    fs.writeFileSync(filepath, [
      'llm:',
      '  primary:',
      '    provider: openai',
      '    model: gpt-4o',
      '    apiKey: sk-test',
      '    temperature: 0.7',
      '    maxTokens: 2048',
      '    timeoutMs: 30000',
      '  retry:',
      '    maxAttempts: 3',
      '    baseDelayMs: 1000',
      '    maxDelayMs: 30000',
      '    factor: 2',
      '    jitter: true',
    ].join('\n'), 'utf8');
    const config = loadConfig(filepath);
    expect(config.llm.primary?.provider).toBe('openai');
    expect(config.llm.retry.maxAttempts).toBe(3);
    fs.unlinkSync(filepath);
  });

  it('loadConfig returns DEFAULT_CONFIG for missing file', () => {
    const config = loadConfig('/nonexistent/path.yaml');
    expect(config.memory.type).toBe('sqlite');
    expect(config.llm.retry.maxAttempts).toBe(3);
  });

  it('loadConfig throws on invalid YAML', () => {
    const filepath = path.join(tmpdir, `bad-harness-${Date.now()}.yaml`);
    fs.writeFileSync(filepath, 'llm: [invalid yaml', 'utf8');
    expect(() => loadConfig(filepath)).toThrow();
    fs.unlinkSync(filepath);
  });
});

describe('InMemoryStore TTL', () => {
  it('entries have expiresAt set when TTL provided', async () => {
    const store = new InMemoryStore();
    await store.set('ns', 'temp', 'val', 30);
    const snap = await store.snapshot();
    const entry = snap.entries.find((e) => e.key === 'temp');
    expect(entry?.expiresAt).toBeDefined();
  });
});
