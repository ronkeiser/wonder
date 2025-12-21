/**
 * Test Invariants
 *
 * Universal assertions that must hold for every workflow run.
 */

import { TraceEventCollection } from '@wonder/sdk';
import { expect } from 'vitest';

interface InvariantOptions {
  /**
   * If true, allows tokens to be in non-terminal states.
   * Use this for failed workflows where tokens may be left in-flight.
   */
  allowNonTerminalTokens?: boolean;
}

/**
 * Universal invariants that must hold for every workflow run.
 * Call this in every test to verify fundamental system guarantees.
 */
export function assertInvariants(
  trace: TraceEventCollection,
  options: InvariantOptions = {},
): void {
  // 1. Every token reaches terminal state (unless allowNonTerminalTokens is set)
  if (!options.allowNonTerminalTokens) {
    const terminalStates = ['completed', 'failed', 'cancelled', 'timed_out'];
    for (const creation of trace.tokens.creations()) {
      const tokenId = creation.tokenId;
      expect(tokenId, 'Token creation must have tokenId').toBeDefined();
      const statuses = trace.tokens.statusTransitions(tokenId!);
      const finalStatus = statuses.at(-1);
      expect(
        terminalStates,
        `Token ${tokenId} did not reach terminal state. Statuses: ${statuses.join(' → ')}`,
      ).toContain(finalStatus);
    }
  }

  // 2. Sequences are positive (uniqueness not guaranteed with concurrent executors)
  const sequences = trace.all().map((e) => e.sequence);
  expect(
    sequences.every((seq) => seq > 0),
    'All sequences must be positive',
  ).toBe(true);

  // 3. Every non-root token has a parent that was created
  const createdIds = new Set(trace.tokens.creations().map((c) => c.tokenId));
  for (const creation of trace.tokens.creations()) {
    const parentId = creation.payload.parentTokenId;
    if (parentId) {
      expect(
        createdIds,
        `Token ${creation.tokenId} references parent ${parentId} that was never created`,
      ).toContain(parentId);
    }
  }

  // 4. No error events
  expect(trace.errors.all(), 'No error events should occur').toHaveLength(0);
}
