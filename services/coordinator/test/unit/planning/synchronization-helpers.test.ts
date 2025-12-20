/**
 * Unit tests for planning/synchronization.ts helper functions
 *
 * Tests needsMerge, getMergeConfig, and hasTimedOut functions.
 */

import { describe, expect, it } from 'vitest';
import { getMergeConfig, hasTimedOut, needsMerge } from '../../../src/planning/synchronization.js';
import type { TransitionDef } from '../../../src/types.js';

describe('needsMerge', () => {
  it('returns false when synchronization is null', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: null,
    };

    expect(needsMerge(transition)).toBe(false);
  });

  it('returns false when synchronization is undefined', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
    };

    expect(needsMerge(transition)).toBe(false);
  });

  it('returns false when synchronization has no merge config', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
      },
    };

    expect(needsMerge(transition)).toBe(false);
  });

  it('returns true when merge config is present', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
        merge: {
          source: '_branch.output',
          target: 'state.results',
          strategy: 'append',
        },
      },
    };

    expect(needsMerge(transition)).toBe(true);
  });
});

describe('getMergeConfig', () => {
  it('returns null when synchronization is null', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: null,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization is undefined', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization has no merge config', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
      },
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns merge config when present', () => {
    const merge = {
      source: '_branch.output.vote',
      target: 'state.votes',
      strategy: 'append' as const,
    };

    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with all strategies', () => {
    const strategies = ['append', 'merge_object', 'keyed_by_branch', 'last_wins'] as const;

    for (const strategy of strategies) {
      const merge = {
        source: '_branch.output',
        target: 'state.result',
        strategy,
      };

      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          merge,
        },
      };

      expect(getMergeConfig(transition)).toEqual(merge);
    }
  });
});

describe('hasTimedOut', () => {
  describe('no timeout configured', () => {
    it('returns false when timeoutMs is null', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: undefined,
        },
      };

      const waitingSince = new Date(Date.now() - 10000); // 10s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });

    it('returns false when timeoutMs is undefined', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
        },
      };

      const waitingSince = new Date(Date.now() - 10000); // 10s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });

    it('returns false when synchronization is null', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: null,
      };

      const waitingSince = new Date(Date.now() - 10000); // 10s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });
  });

  describe('no waiting timestamp', () => {
    it('returns false when oldestWaitingTimestamp is null', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 5000,
        },
      };

      expect(hasTimedOut(transition, null)).toBe(false);
    });
  });

  describe('timeout elapsed checks', () => {
    it('returns false when time has not elapsed', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 10000, // 10s timeout
        },
      };

      const waitingSince = new Date(Date.now() - 5000); // 5s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });

    it('returns true when time has just elapsed', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 5000, // 5s timeout
        },
      };

      const waitingSince = new Date(Date.now() - 5001); // 5001ms ago
      expect(hasTimedOut(transition, waitingSince)).toBe(true);
    });

    it('returns true when time has well elapsed', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 1000, // 1s timeout
        },
      };

      const waitingSince = new Date(Date.now() - 10000); // 10s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(true);
    });

    it('returns false for exact boundary (not >= but >=)', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 5000, // 5s timeout
        },
      };

      const waitingSince = new Date(Date.now() - 5000); // exactly 5s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(true); // >= so should be true
    });
  });

  describe('edge cases with time precision', () => {
    it('handles very short timeouts (100ms)', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 100,
        },
      };

      const waitingSince = new Date(Date.now() - 150);
      expect(hasTimedOut(transition, waitingSince)).toBe(true);
    });

    it('handles very long timeouts (1 hour)', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 3600000, // 1 hour
        },
      };

      const waitingSince = new Date(Date.now() - 1800000); // 30 min ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });

    it('treats zero timeout as no timeout (falsy check)', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 0, // 0 is falsy, treated as no timeout
        },
      };

      const waitingSince = new Date(Date.now() - 1000); // 1s ago
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });

    it('handles future timestamp (clock skew)', () => {
      const transition: TransitionDef = {
        id: 'trans-1',
        fromNodeId: 'a',
        toNodeId: 'b',
        priority: 0,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fan-out-1',
          timeoutMs: 5000,
        },
      };

      const waitingSince = new Date(Date.now() + 1000); // 1s in the future
      expect(hasTimedOut(transition, waitingSince)).toBe(false);
    });
  });
});
