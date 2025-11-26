/** Queue types for workflow task distribution */

/**
 * Task sent from DO to Worker via Queue.
 * Represents a single unit of work (executing one node for one token).
 */
export interface WorkflowTask {
  /** Unique task ID for idempotency and tracking */
  task_id: string;

  /** Workflow run this task belongs to */
  workflow_run_id: string;

  /** Token executing this task */
  token_id: string;

  /** Node to execute */
  node_id: string;

  /** Action to perform */
  action_id: string;

  /** Action kind (determines execution path) */
  action_kind:
    | 'llm_call'
    | 'mcp_tool'
    | 'http_request'
    | 'human_input'
    | 'update_context'
    | 'write_artifact'
    | 'workflow_call'
    | 'vector_search'
    | 'emit_metric';

  /** Action implementation details (discriminated by action_kind) */
  action_implementation: Record<string, unknown>;

  /** Input data for this task (after input_mapping applied) */
  input_data: Record<string, unknown>;

  /** Durable Object ID for sending result back */
  durable_object_id: string;

  /** Timestamp when task was enqueued */
  enqueued_at: string;
}

/**
 * Result returned from Worker to DO after task execution.
 */
export interface WorkflowTaskResult {
  /** Original task ID for correlation */
  task_id: string;

  /** Token that executed this task */
  token_id: string;

  /** Execution status */
  status: 'success' | 'failure';

  /** Output data from action execution (staged for merge) */
  output_data?: Record<string, unknown>;

  /** Error details if status === 'failure' */
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };

  /** Timestamp when task completed */
  completed_at: string;
}

/**
 * Message format for Queue batch operations.
 * Each message contains one WorkflowTask.
 */
export interface QueueMessage<T = WorkflowTask> {
  id: string;
  timestamp: Date;
  body: T;
}
