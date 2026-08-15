import fs from 'node:fs';
import path from 'node:path';
import { dump, load } from 'js-yaml';
import { ZodError } from 'zod';
import { DEFAULT_CONFIG, HarnessConfigSchema } from './schema.js';
import type { HarnessConfig } from './schema.js';

const FILENAME = 'harness.config.yaml';

export function findConfigFile(start = process.cwd()): string | null {
  let dir = path.resolve(start);
  const root = path.parse(dir).root;
  for (;;) {
    const p = path.join(dir, FILENAME);
    if (fs.existsSync(p)) return p;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

export function loadConfig(configPath?: string): HarnessConfig {
  const resolved = configPath ?? findConfigFile();
  if (!resolved || !fs.existsSync(resolved)) return DEFAULT_CONFIG;
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = (load(raw) as Record<string, unknown>) ?? {};
  try {
    return HarnessConfigSchema.parse(parsed);
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid config at ${resolved}\n${issues}`);
    }
    throw e;
  }
}

export function saveConfig(config: HarnessConfig, configPath?: string): void {
  const p = configPath ?? path.join(process.cwd(), FILENAME);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, dump(config), 'utf8');
}

export function createDefaultConfig(configPath?: string): string {
  const p = configPath ?? path.join(process.cwd(), FILENAME);
  if (fs.existsSync(p)) throw new Error(`Config already exists: ${p}`);
  const dir = path.dirname(p);
  if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, dump(DEFAULT_CONFIG), 'utf8');
  return p;
}
