/**
 * Action Handler Types
 *
 * Common interfaces for all action handlers.
 */

import type { Emitter } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import type { Action } from '@wonder/resources/types';

/**
 * Input to an action handler
 */
export interface ActionInput {
  /** The action definition */
  action: Action;

  /** Mapped input from step.inputMapping */
  input: Record<string, unknown>;

  /** Execution context */
  context: {
    workflowRunId: string;
    tokenId: string;
    stepRef: string;
  };
}

/**
 * Output from an action handler
 */
export interface ActionOutput {
  /** Whether the action succeeded */
  success: boolean;

  /** Output data to be mapped via step.outputMapping */
  output: Record<string, unknown>;

  /** Error details if failed */
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };

  /** Execution metrics */
  metrics?: {
    durationMs: number;
    llmTokens?: {
      input: number;
      output: number;
      costUsd: number;
    };
  };

  /**
   * Signals that the action requires the token to wait for an external event
   * (e.g., sub-workflow completion, human input).
   * When true, the coordinator should not complete the token but mark it as waiting.
   */
  waiting?: {
    type: 'subworkflow';
    childRunId: string;
    timeoutMs?: number;
  };
}

/**
 * Dependencies injected into action handlers
 */
export interface ActionDeps {
  logger: Logger;
  emitter: Emitter;
  env: Env;
}

/**
 * Action handler function signature
 */
export type ActionHandler = (input: ActionInput, deps: ActionDeps) => Promise<ActionOutput>;
