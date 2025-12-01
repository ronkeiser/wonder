/**
 * Task Dispatcher
 *
 * Enqueues workflow tasks to the execution queue.
 */

import { ulid } from 'ulid';
import type { Token, WorkflowTask } from './types.js';

/**
 * Dispatch a token for execution
 *
 * Creates a WorkflowTask message and sends it to the queue.
 * The executor service will pick up the task and execute the node's action.
 *
 * @param queue - Cloudflare Queue binding
 * @param token - Token to execute
 * @param workflowRunId - Workflow run ID
 * @param context - Current workflow context (will be provided as input_data)
 */
export function dispatchTask(
  queue: Queue<WorkflowTask>,
  token: Token,
  workflowRunId: string,
  context: Record<string, unknown>,
): void {
  const task: WorkflowTask = {
    task_id: ulid(),
    workflow_run_id: workflowRunId,
    token_id: token.id,
    node_id: token.node_id,
    input_data: context,
    branch: token.fan_out_node_id
      ? {
          id: token.id,
          index: token.branch_index,
          total: token.branch_total,
        }
      : undefined,
    retry_count: 0,
    created_at: new Date().toISOString(),
  };

  queue.send(task);
}
