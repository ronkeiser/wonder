/**
 * Task Result Handler
 *
 * Processes task completion messages from the executor queue.
 */

import type { ContextManager } from './context.js';
import type { TokenManager } from './tokens.js';
import type { TaskResult } from './types.js';

/**
 * Handle a batch of task results from the queue
 *
 * For each result:
 * 1. Update context with output_data
 * 2. Update token status
 * 3. Determine next action (for now, just mark complete)
 *
 * @param results - Batch of task results from queue
 * @param context - Context manager instance
 * @param tokens - Token manager instance
 */
export async function handleTaskResults(
  results: TaskResult[],
  context: ContextManager,
  tokens: TokenManager,
): Promise<void> {
  for (const result of results) {
    if (result.success && result.output_data) {
      // Update context with task output
      for (const [path, value] of Object.entries(result.output_data)) {
        context.updateContext(path, value);
      }

      // Mark token as completed
      await tokens.updateStatus(result.token_id, 'completed');
    } else if (result.error) {
      // Task failed
      // For minimal workflow: mark token as cancelled
      // Later: implement retry logic, error transitions
      await tokens.updateStatus(result.token_id, 'cancelled');
    }
  }
}
