import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface LLMConfig {
  primary: {
    provider: string;
    model: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  fallback?: {
    provider: string;
    model: string;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    factor: number;
    jitter: boolean;
  };
}

export interface MemoryConfig {
  type: 'sqlite' | 'memory';
  path: string;
  retentionDays: number;
}

export interface HarnessConfig {
  llm: LLMConfig;
  memory: MemoryConfig;
}

export const DEFAULT_CONFIG: HarnessConfig = {
  llm: {
    primary: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: '',
      temperature: 0.7,
      maxTokens: 2048,
      timeoutMs: 30000,
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      factor: 2,
      jitter: true,
    },
  },
  memory: {
    type: 'sqlite',
    path: '.harness/memory.db',
    retentionDays: 30,
  },
};

export function createDefaultConfig(filepath: string): string {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const yamlContent = yaml.dump(DEFAULT_CONFIG);
  fs.writeFileSync(filepath, yamlContent, 'utf8');
  return filepath;
}

export function loadConfig(filepath: string): HarnessConfig {
  if (!fs.existsSync(filepath)) {
    return DEFAULT_CONFIG;
  }
  
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const config = yaml.load(content) as HarnessConfig;
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    throw new Error(`Failed to load config from ${filepath}: ${error}`);
  }
}