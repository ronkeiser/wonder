/**
 * Dispatch Context
 *
 * Dependencies required to apply decisions and execute effects.
 * Created once per conversation, passed to applyDecisions().
 */

import type { Emitter } from '@wonder/events';

import type { AsyncOpManager } from '../operations/async';
import type { MessageManager } from '../operations/messages';
import type { MoveManager } from '../operations/moves';
import type { TurnManager } from '../operations/turns';

/**
 * Context for dispatching decisions.
 *
 * Contains all managers and service bindings needed to apply decisions.
 */
export type DispatchContext = {
  // Operations managers (local state mutations)
  turns: TurnManager;
  messages: MessageManager;
  moves: MoveManager;
  asyncOps: AsyncOpManager;

  // Event emission
  emitter: Emitter;

  // Conversation identity
  conversationId: string;

  // External services (RPC boundaries)
  coordinator: Env['COORDINATOR'];
  executor: Env['EXECUTOR'];
  agent: Env['AGENT'];
  resources: Env['RESOURCES'];

  // Environment (for API keys, etc.)
  env: Env;

  // Async primitives
  waitUntil: (promise: Promise<unknown>) => void;
};
