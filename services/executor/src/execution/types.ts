/**
 * Task Context - In-memory state during task execution
 *
 * @see docs/architecture/executor.md
 */
export interface TaskContext {
  /** Immutable - from payload */
  input: Record<string, unknown>;
  /** Mutable - accumulates step outputs */
  state: Record<string, unknown>;
  /** Set by steps, returned to coordinator */
  output: Record<string, unknown>;
}

/**
 * Step execution result
 */
export interface StepResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: {
    message: string;
    retryable: boolean;
  };
  skipped?: boolean;
  skipReason?: 'condition_false' | 'condition_skip';
}

/**
 * Action execution result (from action handlers)
 */
export interface ActionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };
  metrics?: {
    durationMs: number;
    llmTokens?: {
      input: number;
      output: number;
      costUsd: number;
    };
  };
}

/**
 * Step failure error - signals step failed with abort
 */
export class StepFailureError extends Error {
  constructor(
    public readonly stepRef: string,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'StepFailureError';
  }
}

/**
 * Task retry error - signals entire task should be retried
 */
export class TaskRetryError extends Error {
  constructor(
    public readonly stepRef: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskRetryError';
  }
}

/**
 * Execution metrics collected during task run
 */
export interface ExecutionMetrics {
  durationMs: number;
  stepsExecuted: number;
  stepsSkipped: number;
  llmTokens?: {
    input: number;
    output: number;
    costUsd: number;
  };
}
