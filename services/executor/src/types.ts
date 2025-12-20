/**
 * WorkflowTask - Task format for RPC
 */
export interface WorkflowTask {
  workflowRunId: string;
  tokenId: string;
  nodeId: string;
  actionKind: string;
  inputData: Record<string, unknown>;
  retryCount: number;
}

/**
 * TaskResult - Result format returned via RPC
 */
export interface TaskResult {
  taskId: string;
  workflowRunId: string;
  tokenId: string;
  nodeId: string;
  success: boolean;
  outputData?: object;
  error?: string;
  completedAt: string;
}
