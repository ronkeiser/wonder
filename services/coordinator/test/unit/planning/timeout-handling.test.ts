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
    workflow_run_id: 'run-1',
    node_id: 'A',
    status: 'waiting_for_siblings',
    path_id: 'root.A.0',
    branch_index: 0,
    branch_total: 1,
    parent_token_id: null,
    fan_out_transition_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    arrived_at: null,
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
    from_node_id: 'A',
    to_node_id: 'B',
    priority: 1,
    condition: null,
    spawn_count: null,
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
          sibling_group: 'group-1',
          on_timeout: 'fail',
          timeout_ms: null,
          merge: undefined,
        },
      });

      const tokens = [
        createToken({ id: 'token-1', path_id: 'root.A.0' }),
        createToken({ id: 'token-2', path_id: 'root.A.1' }),
        createToken({ id: 'token-3', path_id: 'root.A.2' }),
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

    it('uses default fail policy when on_timeout not specified', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'default-group',
          timeout_ms: null,
          merge: undefined,
          // on_timeout not specified - defaults to 'fail'
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
          sibling_group: 'single-group',
          on_timeout: 'fail',
          timeout_ms: null,
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
          sibling_group: 'proceed-group',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
          merge: undefined,
        },
      });

      const tokens = [
        createToken({ id: 'winner', path_id: 'root.A.0.B.1' }),
        createToken({ id: 'loser-1', path_id: 'root.A.0.B.2' }),
        createToken({ id: 'loser-2', path_id: 'root.A.0.B.3' }),
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
        fanInPath: 'root.A.0', // stripped last .nodeId.branchIndex
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
          sibling_group: 'single-proceed',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
          merge: undefined,
        },
      });

      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ id: 'solo', path_id: 'root.X.0' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({
        type: 'ACTIVATE_FAN_IN',
        workflowRunId: 'run-1',
        nodeId: 'B',
        fanInPath: 'root', // root.X.0 → root
        mergedTokenIds: [],
      });
    });

    it('returns empty when no waiting tokens', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'empty-group',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
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
    it('strips last two path segments for fan-in', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'path-test',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
          merge: undefined,
        },
      });

      // Path: root.A.0.B.1 → fan-in: root.A.0
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ path_id: 'root.A.0.B.1' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'root.A.0',
      });
    });

    it('handles deeply nested paths', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'deep-path',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
          merge: undefined,
        },
      });

      // Path: root.A.0.B.1.C.2.D.3 → fan-in: root.A.0.B.1.C.2
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ path_id: 'root.A.0.B.1.C.2.D.3' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'root.A.0.B.1.C.2',
      });
    });

    it('handles root-level paths', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'root-level',
          on_timeout: 'proceed_with_available',
          timeout_ms: null,
          merge: undefined,
        },
      });

      // Path: root.A.0 → fan-in: root
      const decisions = decideOnTimeout({
        waitingTokens: [createToken({ path_id: 'root.A.0' })],
        transition,
        siblingCounts: createSiblingCounts({ total: 1, completed: 0, waiting: 1 }),
        workflowRunId: 'run-1',
      });

      expect(decisions[0]).toMatchObject({
        type: 'ACTIVATE_FAN_IN',
        fanInPath: 'root',
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

    it('returns false when synchronization but no timeout_ms', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'no-timeout',
          timeout_ms: null,
          merge: undefined,
          // no timeout_ms
        },
      });
      const oldestWaiting = new Date('2024-01-15T11:00:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(false);
    });

    it('returns false when timeout_ms is 0', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'zero-timeout',
          timeout_ms: 0,
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
          sibling_group: 'has-timeout',
          timeout_ms: 5000,
          merge: undefined,
        },
      });

      expect(hasTimedOut(transition, null)).toBe(false);
    });
  });

  describe('timeout detection', () => {
    it('returns true when elapsed time >= timeout_ms', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'check-timeout',
          timeout_ms: 30000, // 30 seconds
          merge: undefined,
        },
      });

      // Current time: 12:00:00, oldest waiting: 11:59:00 (60 seconds ago)
      const oldestWaiting = new Date('2024-01-15T11:59:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(true);
    });

    it('returns true when elapsed time equals timeout_ms exactly', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'exact-timeout',
          timeout_ms: 60000, // 60 seconds
          merge: undefined,
        },
      });

      // Current time: 12:00:00, oldest waiting: 11:59:00 (exactly 60 seconds ago)
      const oldestWaiting = new Date('2024-01-15T11:59:00.000Z');

      expect(hasTimedOut(transition, oldestWaiting)).toBe(true);
    });

    it('returns false when elapsed time < timeout_ms', () => {
      const transition = createTransition({
        synchronization: {
          strategy: 'all',
          sibling_group: 'not-yet-timeout',
          timeout_ms: 120000, // 2 minutes
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
          sibling_group: 'short-timeout',
          timeout_ms: 100, // 100ms
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
          sibling_group: 'long-timeout',
          timeout_ms: 3600000, // 1 hour
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
          sibling_group: 'future-timestamp',
          timeout_ms: 1000,
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
          sibling_group: 'now-timestamp',
          timeout_ms: 1000,
          merge: undefined,
        },
      });

      // Exact current time - elapsed = 0
      const nowTimestamp = new Date('2024-01-15T12:00:00.000Z');

      expect(hasTimedOut(transition, nowTimestamp)).toBe(false);
    });
  });
});
