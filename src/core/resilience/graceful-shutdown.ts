export interface ShutdownResult {
  success: boolean;
  completedHandlers: string[];
  timedOutHandlers: string[];
  totalDurationMs: number;
}

export interface ShutdownHandler {
  name: string;
  fn: () => Promise<void>;
}

export class GracefulShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private inProgress = false;

  register(name: string, fn: () => Promise<void>): void {
    this.handlers.push({ name, fn });
  }

  addSignalHandlers(): void {
    const shutdown = () => { this.shutdown(10_000).catch(console.error); process.exit(0); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  async shutdown(timeoutMs = 30_000): Promise<ShutdownResult> {
    if (this.inProgress) return { success: false, completedHandlers: [], timedOutHandlers: [], totalDurationMs: 0 };
    this.inProgress = true;
    const start = Date.now();
    const completed: string[] = [];
    const timedOut: string[] = [];

    // LIFO order
    for (const handler of [...this.handlers].reverse()) {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) {
        timedOut.push(handler.name);
        continue;
      }
      try {
        await Promise.race([
          handler.fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), remaining)),
        ]);
        completed.push(handler.name);
      } catch (err) {
        if (err instanceof Error && err.message === 'timeout') {
          timedOut.push(handler.name);
        } else {
          console.error(`Shutdown handler ${handler.name} failed:`, err);
          completed.push(handler.name);
        }
      }
    }

    return {
      success: timedOut.length === 0,
      completedHandlers: completed,
      timedOutHandlers: timedOut,
      totalDurationMs: Date.now() - start,
    };
  }
}
