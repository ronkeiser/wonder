/** Repository for turn data access in D1 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { turns } from '../../schema';
import type { Turn, TurnCaller, TurnIssues, TurnStatus } from './types';

export type CreateTurnParams = {
  id: string;
  conversationId: string;
  caller: TurnCaller;
  input?: unknown;
  replyToMessageId?: string;
};

export async function createTurn(
  db: DrizzleD1Database,
  params: CreateTurnParams,
): Promise<Turn> {
  const now = new Date().toISOString();

  const [turn] = await db
    .insert(turns)
    .values({
      id: params.id,
      conversationId: params.conversationId,
      callerType: params.caller.type,
      callerUserId: params.caller.type === 'user' ? params.caller.userId : null,
      callerRunId: params.caller.type === 'workflow' ? params.caller.runId : null,
      callerAgentId: params.caller.type === 'agent' ? params.caller.agentId : null,
      callerTurnId: params.caller.type === 'agent' ? params.caller.turnId : null,
      input: params.input ?? null,
      replyToMessageId: params.replyToMessageId ?? null,
      status: 'active',
      createdAt: now,
    })
    .returning();

  return turn;
}

export async function getTurn(
  db: DrizzleD1Database,
  id: string,
): Promise<Turn | null> {
  const result = await db.select().from(turns).where(eq(turns.id, id)).get();
  return result ?? null;
}

export async function listTurnsForConversation(
  db: DrizzleD1Database,
  conversationId: string,
  limit: number = 100,
): Promise<Turn[]> {
  return await db
    .select()
    .from(turns)
    .where(eq(turns.conversationId, conversationId))
    .limit(limit)
    .all();
}

export async function completeTurn(
  db: DrizzleD1Database,
  id: string,
  issues?: TurnIssues,
): Promise<Turn | null> {
  const now = new Date().toISOString();

  const [updated] = await db
    .update(turns)
    .set({
      status: 'completed',
      completedAt: now,
      memoryExtractionFailed: issues?.memoryExtractionFailed ?? null,
      toolFailureCount: issues?.toolFailures ?? null,
    })
    .where(eq(turns.id, id))
    .returning();

  return updated ?? null;
}

export async function failTurn(
  db: DrizzleD1Database,
  id: string,
): Promise<Turn | null> {
  const now = new Date().toISOString();

  const [updated] = await db
    .update(turns)
    .set({
      status: 'failed',
      completedAt: now,
    })
    .where(eq(turns.id, id))
    .returning();

  return updated ?? null;
}

export async function updateTurnStatus(
  db: DrizzleD1Database,
  id: string,
  status: TurnStatus,
): Promise<Turn | null> {
  const updates: Partial<Turn> = { status };
  if (status === 'completed' || status === 'failed') {
    updates.completedAt = new Date().toISOString();
  }

  const [updated] = await db
    .update(turns)
    .set(updates)
    .where(eq(turns.id, id))
    .returning();

  return updated ?? null;
}

export async function linkContextAssembly(
  db: DrizzleD1Database,
  turnId: string,
  workflowRunId: string,
): Promise<Turn | null> {
  const [updated] = await db
    .update(turns)
    .set({ contextAssemblyRunId: workflowRunId })
    .where(eq(turns.id, turnId))
    .returning();

  return updated ?? null;
}

export async function linkMemoryExtraction(
  db: DrizzleD1Database,
  turnId: string,
  workflowRunId: string,
): Promise<Turn | null> {
  const [updated] = await db
    .update(turns)
    .set({ memoryExtractionRunId: workflowRunId })
    .where(eq(turns.id, turnId))
    .returning();

  return updated ?? null;
}
