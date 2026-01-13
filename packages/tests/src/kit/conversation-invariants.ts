/**
 * Conversation Invariants
 *
 * Universal assertions that must hold for every conversation execution.
 * These are structural guarantees, not semantic assertions.
 */

import { expect } from 'vitest';
import type { ConversationTraceEventCollection } from './conversation-trace';

export interface ConversationInvariantOptions {
  /** Allow failed turns without failing the invariant check */
  allowFailedTurns?: boolean;
}

/**
 * Assert conversation execution invariants.
 *
 * These are guarantees about structural correctness of the execution trace.
 * Every test should call this to verify basic execution integrity.
 *
 * Invariants checked:
 * 1. Every turn reaches a terminal state (completed or failed)
 * 2. Every sync tool dispatch has a result recorded
 * 3. All event sequences are positive
 * 4. No error events (unless allowFailedTurns)
 *
 * @example
 * assertConversationInvariants(trace);
 * assertConversationInvariants(trace, { allowFailedTurns: true });
 */
export function assertConversationInvariants(
  trace: ConversationTraceEventCollection,
  options?: ConversationInvariantOptions,
): void {
  // 1. Every turn reaches terminal state
  for (const start of trace.turns.starts()) {
    const turnId = start.payload.turnId;
    const statuses = trace.turns.statusTransitions(turnId);
    const finalStatus = statuses.at(-1);

    expect(
      ['completed', 'failed'].includes(finalStatus ?? ''),
      `Turn ${turnId} did not reach terminal state. Final status: ${finalStatus}`,
    ).toBe(true);
  }

  // 2. Every sync tool dispatch has a result
  for (const dispatch of trace.tools.syncDispatches()) {
    const toolCallId = dispatch.payload.toolCallId;
    const turnId = dispatch.payload.turnId;
    const results = trace.moves.resultsForTurn(turnId);
    const hasResult = results.some((r) => r.payload.toolCallId === toolCallId);

    expect(hasResult, `Sync tool ${toolCallId} in turn ${turnId} has no result recorded`).toBe(
      true,
    );
  }

  // 3. All sequences are positive
  const sequences = trace.all().map((e) => e.sequence);
  const allPositive = sequences.every((seq) => seq > 0);
  expect(allPositive, 'All event sequences must be positive').toBe(true);

  // 4. No error events (unless allowed)
  if (!options?.allowFailedTurns) {
    const errorCount = trace.errors.count();
    expect(errorCount, `Expected no errors but found ${errorCount}`).toBe(0);
  }
}
