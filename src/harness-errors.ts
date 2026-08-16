export class HarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HarnessError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

export class TaskTimeoutError extends HarnessError {
  constructor(taskId: string, timeoutMs: number) {
    super(
      `Task ${taskId} timed out after ${timeoutMs}ms`,
      'TASK_TIMEOUT',
      { taskId, timeoutMs },
    );
    this.name = 'TaskTimeoutError';
  }
}

export class TaskValidationError extends HarnessError {
  constructor(taskId: string, errors: string[]) {
    super(
      `Task ${taskId} validation failed: ${errors.join(', ')}`,
      'TASK_VALIDATION',
      { taskId, errors },
    );
    this.name = 'TaskValidationError';
  }
}

export class SchemaMismatchError extends HarnessError {
  constructor(taskId: string, errors: string[]) {
    super(
      `Task ${taskId} output schema mismatch: ${errors.join(', ')}`,
      'SCHEMA_MISMATCH',
      { taskId, errors },
    );
    this.name = 'SchemaMismatchError';
  }
}

export class AgentAuthenticationError extends HarnessError {
  constructor(provider: string, message = 'Authentication failed') {
    super(message, 'AGENT_AUTH', { provider });
    this.name = 'AgentAuthenticationError';
  }
}

export class RateLimitError extends HarnessError {
  constructor(provider: string, retryAfterMs?: number) {
    super(
      `Rate limit exceeded for ${provider}${retryAfterMs ? `, retry after ${retryAfterMs}ms` : ''}`,
      'RATE_LIMIT',
      { provider, retryAfterMs },
    );
    this.name = 'RateLimitError';
  }
}

export class MaxRetriesExceededError extends HarnessError {
  constructor(taskId: string, retries: number) {
    super(
      `Task ${taskId} failed after ${retries} max retries`,
      'MAX_RETRIES_EXCEEDED',
      { taskId, retries },
    );
    this.name = 'MaxRetriesExceededError';
  }
}
