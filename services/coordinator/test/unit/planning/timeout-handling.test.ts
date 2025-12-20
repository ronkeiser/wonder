/**
 * Unit tests for timeout handling in synchronization.
 *
 * Tests:
 * - decideOnTimeout: Timeout policy decisions ('fail' vs 'proceed_with_available')
 * - hasTimedOut: Timeout detection logic
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiblingCounts, TokenRow } from '../../../src/operations/tokens';
import { decideOnTimeout, hasTimedOut } from '../../../src/planning/synchronization';
import type { TransitionDef } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

function createToken(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: 'token-1',
    workflowRunId: 'run-1',
    nodeId: 'A',
    status: 'waiting_for_siblings',
    pathId: 'root.A.0',
    branchIndex: 0,
    branchTotal: 1,
    parentTokenId: null,
    siblingGroup: null,
    iterationCounts: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    arrivedAt: null,
    ...overrides,
  };
}

function createSiblingCounts(overrides: Partial<SiblingCounts> = {}): SiblingCounts {
  return {
    total: 1,
    completed: 0,
    failed: 0,
    waiting: 1,
    terminal: 0,
    ...overrides,
  };
}

function createTransition(overrides: Partial<TransitionDef> = {}): TransitionDef {
  return {
    id: 'trans-1',
    fromNodeId: 'A',
    toNodeId: 'B',
    priority: 1,
    condition: null,
    spawnCount: null,
    siblingGroup: null,
    synchronization: null,
    ...overrides,
  };
}

// ============================================================================
// decideOnTimeout Tests
// ============================================================================

describe('decideOnTimeout', () => {
  describe('no synchronization configured', () => {
    it('returns empty array when no synchronization', () => {
      const transition = createTransition();
      const decisions = decideOnTimeout({
        waitingTokens: [createToken()],
        transition,
        siblingCounts: createSiblingCounts({ total: 3, completed: 1, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toEqual([]);
    });
  });

  describe('fail policy (default)', () => {
    it('marks all waiting tokens as timed_out', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'group-1',
          onTimeout: 'fail',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      const tokens = [
        createToken({ id: 'token-1', pathId: 'root.A.0' }),
        createToken({ id: 'token-2', pathId: 'root.A.1' }),
        createToken({ id: 'token-3', pathId: 'root.A.2' }),
      ];

      const decisions = decideOnTimeout({
        waitingTokens: tokens,
        transition,
        siblingCounts: createSiblingCounts({ total: 5, completed: 2, waiting: 3 }),
        workflowRunId: 'run-1',
      });

      // Should have UPDATE_TOKEN_STATUS for each token + FAIL_WORKFLOW
      expect(decisions).toHaveLength(4);

      expect(decisions[0]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'token-1',
        status: 'timed_out',
      });
      expect(decisions[1]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'token-2',
        status: 'timed_out',
      });
      expect(decisions[2]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'token-3',
        status: 'timed_out',
      });
      expect(decisions[3]).toEqual({
        type: 'FAIL_WORKFLOW',
        error: "Synchronization timeout for sibling group 'group-1'",
      });
    });

    it('uses default fail policy when onTimeout not specified', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'default-group',
          timeoutMs: undefined,
          merge: undefined,
          // onTimeout not specified - defaults to 'fail'
        },
      });

      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ id: 'token-1' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 2, completed: 1, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toContainEqual({
        type: 'FAIL_WORKFLOW',
        error: "Synchronization timeout for sibling group 'default-group'",
      });
    });

    it('handles single waiting token', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'single-group',
          onTimeout: 'fail',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ id: 'lonely-token' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'lonely-token',
        status: 'timed_out',
      });
      expect(decisions[1].type).toBe('FAIL_WORKFLOW');
    });
  });

  describe('proceed_with_available policy', () => {
    it('activates fan-in with first waiting token', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'proceed-group',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      const tokens = [
        createToken({ id: 'winner', pathId: 'root.A.0.B.1', siblingGroup: 'proceed-group' }),
        createToken({ id: 'loser-1', pathId: 'root.A.0.B.2', siblingGroup: 'proceed-group' }),
        createToken({ id: 'loser-2', pathId: 'root.A.0.B.3', siblingGroup: 'proceed-group' }),
      ];

      const decisions = decideOnTimeout({
        waitingTokens: tokens,
        transition,
        siblingCounts: createSiblingCounts({ total: 5, completed: 2, waiting: 3 }),
        workflowRunId: 'run-1',
      });

      // Should have ACTIVATE_FAN_IN + UPDATE_TOKEN_STATUS for remaining
      expect(decisions).toHaveLength(3);

      expect(decisions[0]).toEqual({
        type: 'ACTIVATE_FAN_IN',
        workflowRunId: 'run-1',
        nodeId: 'B',
        fanInPath: 'proceed-group:B', // siblingGroup:toNodeId
        mergedTokenIds: [],
      });

      expect(decisions[1]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'loser-1',
        status: 'timed_out',
      });

      expect(decisions[2]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'loser-2',
        status: 'timed_out',
      });
    });

    it('handles single waiting token - just activates fan-in', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'single-proceed',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ id: 'solo', pathId: 'root.X.0', siblingGroup: 'single-proceed' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({
        type: 'ACTIVATE_FAN_IN',
        workflowRunId: 'run-1',
        nodeId: 'B',
        fanInPath: 'single-proceed:B', // siblingGroup:toNodeId
        mergedTokenIds: [],
      });
    });

    it('returns empty when no waiting tokens', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'empty-group',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      const decisions = decideOnTimeout({
        waitingTokens: [],
        transition,
        siblingCounts: createSiblingCounts({ total: 3, completed: 3, waiting: 0 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toEqual([]);
    });
  });

  describe('fan-in path calculation', () => {
    it('builds fan-in path from siblingGroup and toNodeId', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'path-test',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      // fanInPath is built from siblingGroup:toNodeId
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ pathId: 'root.A.0.B.1', siblingGroup: 'path-test' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'path-test:B',
      });
    });

    it('handles different sibling groups', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'deep-path',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      // fanInPath is built from siblingGroup:toNodeId
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ pathId: 'root.A.0.B.1.C.2.D.3', siblingGroup: 'deep-path' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'deep-path:B',
      });
    });

    it('handles root-level paths', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'root-level',
          onTimeout: 'proceed_with_available',
          timeoutMs: undefined,
          merge: undefined,
        },
      });

      // fanInPath is built from siblingGroup:toNodeId
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ pathId: 'root.A.0', siblingGroup: 'root-level' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'root-level:B',
      });
    });
  });
});

// ============================================================================
// hasTimedOut Tests
// ============================================================================

describe('hasTimedOut', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('no timeout configured', () => {
    it('returns false when no synchronization', () => {
      const transition = createTransition();
      const oldestWaiting = new Date('2024-01-15T11:00:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });

    it('returns false when synchronization but no timeoutMs', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'no-timeout',
          timeoutMs: undefined,
          merge: undefined,
          // no timeoutMs
        },
      });
      const oldestWaiting = new Date('2024-01-15T11:00:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });

    it('returns false when timeoutMs is 0', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'zero-timeout',
          timeoutMs: 0,
          merge: undefined,
        },
      });
      const oldestWaiting = new Date('2024-01-15T11:00:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });
  });

  describe('no waiting timestamp', () => {
    it('returns false when oldestWaitingTimestamp is null', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'has-timeout',
          timeoutMs: 5000,
          merge: undefined,
        },
      });

      expect(hasTimedOut(transition, null)).toBe(false);
    });
  });

  describe('timeout detection', () => {
    it('returns true when elapsed time >= timeoutMs', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'check-timeout',
          timeoutMs: 30000, // 30 seconds
          merge: undefined,
        },
      });

      // Current time: 12:00:00, oldest waiting: 11:59:00 (60 seconds ago)
      const oldestWaiting = new Date('2024-01-15T11:59:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(true);
    });

    it('returns true when elapsed time equals timeoutMs exactly', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'exact-timeout',
          timeoutMs: 60000, // 60 seconds
          merge: undefined,
        },
      });

      // Current time: 12:00:00, oldest waiting: 11:59:00 (exactly 60 seconds ago)
      const oldestWaiting = new Date('2024-01-15T11:59:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(true);
    });

    it('returns false when elapsed time < timeoutMs', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'not-yet-timeout',
          timeoutMs: 120000, // 2 minutes
          merge: undefined,
        },
      });

      // Current time: 12:00:00, oldest waiting: 11:59:00 (60 seconds ago)
      const oldestWaiting = new Date('2024-01-15T11:59:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });

    it('handles very short timeouts (millisecond precision)', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'short-timeout',
          timeoutMs: 100, // 100ms
          merge: undefined,
        },
      });

      // 100ms ago
      const oldestWaiting = new Date('2024-01-15T11:59:59.900Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(true);
    });

    it('handles very long timeouts', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'long-timeout',
          timeoutMs: 3600000, // 1 hour
          merge: undefined,
        },
      });

      // 30 minutes ago - not yet timed out
      const oldestWaiting = new Date('2024-01-15T11:30:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles future timestamp (should not timeout)', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'future-timestamp',
          timeoutMs: 1000,
          merge: undefined,
        },
      });

      // Future timestamp - elapsed time would be negative
      const futureTimestamp = new Date('2024-01-15T12:01:00.000Z');

      expect(hasTimedOut(transition, futureTimestamp)).toBe(false);
    });

    it('handles timestamp at exact current time', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          siblingGroup: 'now-timestamp',
          timeoutMs: 1000,
          merge: undefined,
        },
      });

      // Exact current time - elapsed = 0
      const nowTimestamp = new Date('2024-01-15T12:00:00.000Z');

      expect(hasTimedOut(transition, nowTimestamp)).toBe(false);
    });
  });
});
