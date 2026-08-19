import type { Checkpointer, Checkpoint } from '../types.js';

/**
 * In-memory checkpointer for testing and development.
 * Not persistent across process restarts.
 */
export class InMemoryCheckpointer implements Checkpointer {
  private checkpoints = new Map<string, Checkpoint[]>();

  async get(threadId: string, checkpointId?: string): Promise<Checkpoint | null> {
    const threadCheckpoints = this.checkpoints.get(threadId) ?? [];
    if (threadCheckpoints.length === 0) return null;

    if (checkpointId) {
      const found = threadCheckpoints.find((c) => c.checkpointId === checkpointId);
      return found ?? null;
    }

    // Return latest checkpoint
    const latest = threadCheckpoints[threadCheckpoints.length - 1];
    return latest ?? null;
  }

  async put(checkpoint: Checkpoint): Promise<void> {
    const threadCheckpoints = this.checkpoints.get(checkpoint.threadId) ?? [];
    threadCheckpoints.push(checkpoint);
    this.checkpoints.set(checkpoint.threadId, threadCheckpoints);
  }

  async list(threadId: string): Promise<Checkpoint[]> {
    return [...(this.checkpoints.get(threadId) ?? [])].sort(
      (a, b) => a.metadata.step - b.metadata.step
    );
  }

  async delete(threadId: string): Promise<void> {
    this.checkpoints.delete(threadId);
  }

  /** Clear all checkpoints (for testing) */
  clear(): void {
    this.checkpoints.clear();
  }
}