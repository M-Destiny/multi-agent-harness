export class HarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable = false,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HarnessError';
  }
}

export class AgentError extends HarnessError {
  constructor(message: string, public readonly agentId: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', true, context);
    this.name = 'AgentError';
  }
}

export class WorkflowError extends HarnessError {
  constructor(message: string, public readonly workflowId: string, public readonly taskId?: string, context?: Record<string, unknown>) {
    super(message, 'WORKFLOW_ERROR', false, context);
    this.name = 'WorkflowError';
  }
}

export class MemoryError extends HarnessError {
  constructor(message: string, public readonly namespace: string, context?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', false, context);
    this.name = 'MemoryError';
  }
}

export class EvaluationError extends HarnessError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVALUATION_ERROR', true, context);
    this.name = 'EvaluationError';
  }
}
