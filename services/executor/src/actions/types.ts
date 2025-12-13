/**
 * Action Handler Types
 *
 * Common interfaces for all action handlers.
 */

import type { Logger } from '@wonder/logs';
import type { Action } from '@wonder/resources/types';

/**
 * Input to an action handler
 */
export interface ActionInput {
  /** The action definition */
  action: Action;

  /** Mapped input from step.input_mapping */
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

  /** Output data to be mapped via step.output_mapping */
  output: Record<string, unknown>;

  /** Error details if failed */
  error?: {
    message: string;
    code?: string;
    retryable: boolean;
  };

  /** Execution metrics */
  metrics?: {
    duration_ms: number;
    llm_tokens?: {
      input: number;
      output: number;
      cost_usd: number;
    };
  };
}

/**
 * Dependencies injected into action handlers
 */
export interface ActionDeps {
  logger: Logger;
  env: Env;
}

/**
 * Action handler function signature
 */
export type ActionHandler = (input: ActionInput, deps: ActionDeps) => Promise<ActionOutput>;
