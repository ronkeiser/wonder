/**
 * Coordinator Type Definitions
 */

/**
 * Context snapshot for read-only access by decision logic
 */
export type ContextSnapshot = {
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  output: Record<string, unknown>;
};

/**
 * Task execution result from Executor
 */
export type TaskResult = {
  output_data: Record<string, unknown>;
};
