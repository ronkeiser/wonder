/**
 * Turn Operations
 *
 * Drizzle-based operations for turn state management.
 *
 * Manages the turn lifecycle:
 * - Creation with caller tracking
 * - Status transitions (active → completed | failed)
 * - Workflow run linking (context assembly, memory extraction)
 * - Recent turns queries for context assembly
 */

import type { Emitter } from '@wonder/events';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';

import { asyncOps, turns } from '../schema';
import type { Caller, TurnIssues, TurnStatus } from '../types';
import type { AgentDb } from './db';

/** Turn row type inferred from schema */
export type TurnRow = typeof turns.$inferSelect;

/** Terminal states where turn execution is finished */
const TERMINAL_STATES: TurnStatus[] = ['completed', 'failed'];

/** Create turn parameters */
export type CreateTurnParams = {
  conversationId: string;
  caller: Caller;
  input: unknown;
  replyToMessageId?: string;
};

/**
 * TurnManager manages turn state for a conversation.
 *
 * Uses drizzle-orm for type-safe turn lifecycle management including
 * creation, status updates, and queries.
 */
export class TurnManager {
  private readonly db: AgentDb;
  private readonly emitter: Emitter;

  constructor(db: AgentDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Create a new turn.
   */
  create(params: CreateTurnParams): string {
    const turnId = ulid();
    const now = new Date();

    // Flatten the caller discriminated union for storage
    const callerFields = this.flattenCaller(params.caller);

    this.db
      .insert(turns)
      .values({
        id: turnId,
        conversationId: params.conversationId,
        ...callerFields,
        input: params.input,
        replyToMessageId: params.replyToMessageId ?? null,
        status: 'active',
        createdAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.turns.created',
      payload: {
        turnId,
        conversationId: params.conversationId,
        callerType: params.caller.type,
      },
    });

    return turnId;
  }

  /**
   * Get turn by ID.
   */
  get(turnId: string): TurnRow | null {
    const result = this.db.select().from(turns).where(eq(turns.id, turnId)).limit(1).all();

    return result[0] ?? null;
  }

  /**
   * Get active turns for a conversation.
   */
  getActive(conversationId: string): TurnRow[] {
    return this.db
      .select()
      .from(turns)
      .where(and(eq(turns.conversationId, conversationId), eq(turns.status, 'active')))
      .all();
  }

  /**
   * Get recent turns for context (most recent first).
   */
  getRecent(conversationId: string, limit: number): TurnRow[] {
    return this.db
      .select()
      .from(turns)
      .where(eq(turns.conversationId, conversationId))
      .orderBy(desc(turns.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Count active turns for a conversation.
   */
  getActiveCount(conversationId: string): number {
    const result = this.db
      .select({ count: count() })
      .from(turns)
      .where(and(eq(turns.conversationId, conversationId), eq(turns.status, 'active')))
      .all();

    return result[0]?.count ?? 0;
  }

  /**
   * Link context assembly workflow run.
   */
  linkContextAssembly(turnId: string, runId: string): void {
    this.db
      .update(turns)
      .set({ contextAssemblyRunId: runId })
      .where(eq(turns.id, turnId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.turns.context_assembly_linked',
      payload: { turnId, runId },
    });
  }

  /**
   * Link memory extraction workflow run.
   */
  linkMemoryExtraction(turnId: string, runId: string): void {
    this.db
      .update(turns)
      .set({ memoryExtractionRunId: runId })
      .where(eq(turns.id, turnId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.turns.memory_extraction_linked',
      payload: { turnId, runId },
    });
  }

  /**
   * Check if turn has pending async ops.
   */
  hasPendingAsync(turnId: string): boolean {
    const result = this.db
      .select({ count: count() })
      .from(asyncOps)
      .where(and(eq(asyncOps.turnId, turnId), eq(asyncOps.status, 'pending')))
      .all();

    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Mark turn as completed.
   * Returns false if turn is already in a terminal state.
   */
  complete(turnId: string, issues?: TurnIssues): boolean {
    const turn = this.get(turnId);

    if (!turn) {
      this.emitter.emitTrace({
        type: 'operation.turns.complete_failed',
        payload: { turnId, reason: 'turn not found' },
      });
      return false;
    }

    if (TERMINAL_STATES.includes(turn.status)) {
      this.emitter.emitTrace({
        type: 'operation.turns.complete_blocked',
        payload: {
          turnId,
          currentStatus: turn.status,
          reason: 'turn already in terminal state',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(turns)
      .set({
        status: 'completed',
        completedAt: now,
        memoryExtractionFailed: issues?.memoryExtractionFailed ?? null,
        toolFailureCount: issues?.toolFailures ?? null,
      })
      .where(eq(turns.id, turnId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.turns.completed',
      payload: {
        turnId,
        from: turn.status,
        issues: issues ?? null,
      },
    });

    return true;
  }

  /**
   * Mark turn as failed.
   * Returns false if turn is already in a terminal state.
   */
  fail(turnId: string, errorCode: string, errorMessage: string): boolean {
    const turn = this.get(turnId);

    if (!turn) {
      this.emitter.emitTrace({
        type: 'operation.turns.fail_failed',
        payload: { turnId, reason: 'turn not found' },
      });
      return false;
    }

    if (TERMINAL_STATES.includes(turn.status)) {
      this.emitter.emitTrace({
        type: 'operation.turns.fail_blocked',
        payload: {
          turnId,
          currentStatus: turn.status,
          reason: 'turn already in terminal state',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(turns)
      .set({
        status: 'failed',
        completedAt: now,
      })
      .where(eq(turns.id, turnId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.turns.failed',
      payload: {
        turnId,
        from: turn.status,
        errorCode,
        errorMessage,
      },
    });

    return true;
  }

  /**
   * Check if turn is in a terminal state.
   */
  isTerminal(turnId: string): boolean {
    const turn = this.get(turnId);
    return turn !== null && TERMINAL_STATES.includes(turn.status);
  }

  /**
   * Reconstruct caller from flattened fields.
   */
  reconstructCaller(turn: TurnRow): Caller {
    switch (turn.callerType) {
      case 'user':
        return { type: 'user', userId: turn.callerUserId! };
      case 'workflow':
        return { type: 'workflow', runId: turn.callerRunId! };
      case 'agent':
        return { type: 'agent', agentId: turn.callerAgentId!, turnId: turn.callerTurnId! };
    }
  }

  /**
   * Flatten caller discriminated union for storage.
   */
  private flattenCaller(caller: Caller): {
    callerType: 'user' | 'workflow' | 'agent';
    callerUserId: string | null;
    callerRunId: string | null;
    callerAgentId: string | null;
    callerTurnId: string | null;
  } {
    switch (caller.type) {
      case 'user':
        return {
          callerType: 'user',
          callerUserId: caller.userId,
          callerRunId: null,
          callerAgentId: null,
          callerTurnId: null,
        };
      case 'workflow':
        return {
          callerType: 'workflow',
          callerUserId: null,
          callerRunId: caller.runId,
          callerAgentId: null,
          callerTurnId: null,
        };
      case 'agent':
        return {
          callerType: 'agent',
          callerUserId: null,
          callerRunId: null,
          callerAgentId: caller.agentId,
          callerTurnId: caller.turnId,
        };
    }
  }
}
