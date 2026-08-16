import type { HarnessEvent } from '../types.js';

export interface EventStats {
  task_start: number;
  task_complete: number;
  task_failed: number;
  delegation: number;
  llm_call: number;
  agent_spawn: number;
  memory_read: number;
  memory_write: number;
  [key: string]: number;
}

export class EventLogger {
  private stats: EventStats = {
    task_start: 0, task_complete: 0, task_failed: 0,
    delegation: 0, llm_call: 0, agent_spawn: 0,
    memory_read: 0, memory_write: 0,
  };

  constructor(private readonly logFile?: string) {
    if (this.logFile) {
      // Write header
      import('node:fs').then((fs) => {
        fs.writeFileSync(this.logFile!, `=== Event log started at ${new Date().toISOString()} ===\n`);
      });
    }
  }

  log(event: HarnessEvent): void {
    const type = event.type;
    if (type in this.stats) {
      this.stats[type]++;
    } else {
      this.stats[type] = (this.stats[type] ?? 0) + 1;
    }
    if (this.logFile) {
      import('node:fs').then((fs) => {
        fs.appendFileSync(this.logFile!, `${new Date().toISOString()} ${type} ${JSON.stringify(event)}\n`);
      });
    }
  }

  getStats(): EventStats {
    return { ...this.stats };
  }

  reset(): void {
    for (const k of Object.keys(this.stats)) {
      this.stats[k] = 0;
    }
  }
}
