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
import type { ParticipantManager } from '../operations/participants';
import type { TurnManager } from '../operations/turns';
import type { BranchContext } from '../types';

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
  participants: ParticipantManager;

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

  // Alarm scheduling for timeouts
  scheduleAlarm: (timeoutAt: number) => Promise<void>;

  // Streaming callback (set when WebSocket is connected)
  streamToken?: (token: string) => void;

  // Branch context for shell operations (from conversation or inherited from parent)
  branchContext?: BranchContext;
};
