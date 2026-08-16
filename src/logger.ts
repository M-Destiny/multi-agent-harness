import pino from 'pino';

export function createLogger(name: string, level = 'info') {
  return pino({
    name,
    level,
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: { service: 'multi-agent-harness' },
    timestamp: pino.stdTimeFunctions.isoTime,
  }).child({ agentId: undefined, taskId: undefined });
}

export const logger = createLogger('harness');
