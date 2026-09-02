import pino from 'pino';
import type { Logger } from 'pino';
import type { HarnessConfig } from '../config/schema.js';

export function createLogger(config?: HarnessConfig): Logger {
  const level = config?.logging.level ?? 'info';
  const redact = config?.logging.redact ? { paths: ['apiKey', 'password', 'secret', 'token', 'authorization'] } : undefined;
  return pino({ level, redact });
}

export type { Logger };
