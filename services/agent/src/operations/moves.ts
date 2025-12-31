/**
 * Move Operations
 *
 * Drizzle-based operations for move tracking.
 *
 * Moves record each iteration of the agent loop within a turn:
 * - LLM reasoning output
 * - Tool invocations
 * - Tool results
 *
 * The sequence of moves forms the "turn transcript" used for
 * memory extraction and debugging.
 */

import type { Emitter } from '@wonder/events';
import { and, asc, eq, max } from 'drizzle-orm';
import { ulid } from 'ulid';

import { moves } from '../schema';
import type { AgentDb } from './db';

/** Move row type inferred from schema */
export type MoveRow = typeof moves.$inferSelect;

/** Record move parameters */
export type RecordMoveParams = {
  turnId: string;
  reasoning?: string;
  toolCall?: {
    id: string;
    toolId: string;
    input: Record<string, unknown>;
  };
  raw?: string;
};

/**
 * MoveManager tracks iterations within a turn.
 *
 * Each move captures one step of the agent loop:
 * - Reasoning (LLM text output)
 * - Tool invocation (what tool was called with what input)
 * - Tool result (recorded separately when the tool completes)
 */
export class MoveManager {
  private readonly db: AgentDb;
  private readonly emitter: Emitter;

  constructor(db: AgentDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Record a move (LLM iteration).
   * Returns the sequence number assigned to this move.
   */
  record(params: RecordMoveParams): number {
    const moveId = ulid();
    const now = new Date();
    const sequence = this.getNextSequence(params.turnId);

    this.db
      .insert(moves)
      .values({
        id: moveId,
        turnId: params.turnId,
        sequence,
        reasoning: params.reasoning ?? null,
        toolCallId: params.toolCall?.id ?? null,
        toolId: params.toolCall?.toolId ?? null,
        toolInput: params.toolCall?.input ?? null,
        raw: params.raw ?? null,
        createdAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.moves.recorded',
      payload: {
        moveId,
        turnId: params.turnId,
        sequence,
        hasReasoning: !!params.reasoning,
        hasToolCall: !!params.toolCall,
      },
    });

    return sequence;
  }

  /**
   * Get move by ID.
   */
  get(moveId: string): MoveRow | null {
    const result = this.db.select().from(moves).where(eq(moves.id, moveId)).limit(1).all();

    return result[0] ?? null;
  }

  /**
   * Record tool result for a move.
   * Finds the move by turnId and toolCallId and updates its result.
   */
  recordResult(turnId: string, toolCallId: string, result: unknown): boolean {
    const moveRows = this.db
      .select()
      .from(moves)
      .where(and(eq(moves.turnId, turnId), eq(moves.toolCallId, toolCallId)))
      .limit(1)
      .all();

    if (moveRows.length === 0) {
      this.emitter.emitTrace({
        type: 'operation.moves.result_failed',
        payload: { turnId, toolCallId, reason: 'move not found' },
      });
      return false;
    }

    const move = moveRows[0];

    this.db
      .update(moves)
      .set({ toolResult: result })
      .where(eq(moves.id, move.id))
      .run();

    this.emitter.emitTrace({
      type: 'operation.moves.result_recorded',
      payload: {
        moveId: move.id,
        turnId,
        toolCallId,
        sequence: move.sequence,
      },
    });

    return true;
  }

  /**
   * Get all moves for a turn (ordered by sequence).
   */
  getForTurn(turnId: string): MoveRow[] {
    return this.db
      .select()
      .from(moves)
      .where(eq(moves.turnId, turnId))
      .orderBy(asc(moves.sequence))
      .all();
  }

  /**
   * Get next sequence number for a turn.
   */
  getNextSequence(turnId: string): number {
    const result = this.db
      .select({ maxSeq: max(moves.sequence) })
      .from(moves)
      .where(eq(moves.turnId, turnId))
      .all();

    const maxSeq = result[0]?.maxSeq;
    return maxSeq !== null ? maxSeq + 1 : 0;
  }

  /**
   * Get the latest move for a turn.
   */
  getLatest(turnId: string): MoveRow | null {
    const allMoves = this.getForTurn(turnId);
    return allMoves.length > 0 ? allMoves[allMoves.length - 1] : null;
  }
}
