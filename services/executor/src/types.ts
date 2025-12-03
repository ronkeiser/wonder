/**
 * WorkflowTask - Task format for RPC
 */
export interface WorkflowTask {
  workflow_run_id: string;
  token_id: string;
  node_id: string;
  action_kind: string;
  input_data: Record<string, unknown>;
  retry_count: number;
}

/**
 * TaskResult - Result format returned via RPC
 */
export interface TaskResult {
  task_id: string;
  workflow_run_id: string;
  token_id: string;
  node_id: string;
  success: boolean;
  output_data?: object;
  error?: string;
  completed_at: string;
}
