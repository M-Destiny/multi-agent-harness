import type { Task, TaskResult, TaskStatus } from './types.js';

export class TaskQueue {
  private tasks = new Map<string, Task>();
  private results = new Map<string, TaskResult>();

  enqueue(task: Task): void {
    this.tasks.set(task.id, task);
  }

  /** Returns the next task whose dependencies are all completed, optionally filtered by agent capability match. */
  dequeue(): Task | null {
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending') continue;
      if (this.depsComplete(task)) {
        task.status = 'running';
        task.startedAt = new Date();
        return task;
      }
    }
    return null;
  }

  /** Returns all pending tasks whose dependencies are complete. */
  getReady(): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'pending' && this.depsComplete(t));
  }

  /** Returns pending tasks whose dependencies are NOT complete. */
  getBlocked(): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'pending' && !this.depsComplete(t));
  }

  getPending(): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'pending');
  }

  getRunning(): Task[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'running');
  }

  complete(taskId: string, result: TaskResult): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
    }
    this.results.set(taskId, result);
  }

  fail(taskId: string, _error: Error): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.completedAt = new Date();
    }
  }

  markRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'running';
      task.startedAt = new Date();
    }
  }

  getStatus(taskId: string): TaskStatus | null {
    return this.tasks.get(taskId)?.status ?? null;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getResult(taskId: string): TaskResult | undefined {
    return this.results.get(taskId);
  }

  allTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  size(): number {
    return this.tasks.size;
  }

  isComplete(): boolean {
    return Array.from(this.tasks.values()).every((t) => t.status === 'completed' || t.status === 'failed');
  }

  private depsComplete(task: Task): boolean {
    return task.dependencies.every((depId) => {
      const dep = this.tasks.get(depId);
      return dep?.status === 'completed';
    });
  }
}
