import type { ModelProfile } from '@wonder/resources/types';

/**
 * TaskPayload - from Coordinator per execution-model.md
 */
export interface TaskPayload {
  tokenId: string; // For result correlation
  workflowRunId: string; // For sub-workflow context
  rootRunId: string; // Top-level run ID for unified event timeline
  projectId: string; // For trace event context
  taskId: string; // Task to execute
  taskVersion: number;
  input: Record<string, unknown>; // Mapped from workflow context

  // Resource mappings (generic_name → container_do_id)
  resources?: Record<string, string>;

  // Execution config
  timeoutMs?: number;
  retryAttempt?: number; // Current retry count (for retry logic)

  // Observability config
  traceEvents?: boolean; // Enable/disable trace events for this task
}

/**
 * TaskResult - to Coordinator per execution-model.md
 */
export interface TaskResult {
  tokenId: string;
  success: boolean;
  output: Record<string, unknown>;

  error?: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    stepRef?: string;
    message: string;
    retryable: boolean;
  };

  metrics: {
    durationMs: number;
    stepsExecuted: number;
    llmTokens?: {
      input: number;
      output: number;
      costUsd: number;
    };
  };
}

/**
 * AgentTaskPayload - from AgentDO for tool execution
 *
 * Simpler than TaskPayload since agent context differs from workflow context.
 * Agent provides conversation routing info for callback.
 */
export interface AgentTaskPayload {
  toolCallId: string; // For result correlation (maps to tokenId in callback)
  conversationId: string; // For callback routing to agent
  turnId: string; // For callback context
  taskId: string; // Task to execute
  input: Record<string, unknown>; // Tool input from LLM

  // Observability context
  projectId?: string; // For trace events (optional, derived from agent if not provided)

  // Execution config
  timeoutMs?: number;
}

// Legacy interface - to be removed after migration
export interface LLMCallParams {
  modelProfile: ModelProfile;
  prompt: string;
  jsonSchema?: object;
  workflowRunId: string;
  tokenId: string;
}

export interface LLMCallResult {
  response: string;
}
