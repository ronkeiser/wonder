/**
 * Decision Batching
 *
 * Optimizes Decision[] by combining compatible operations.
 * This reduces database round-trips and improves throughput.
 *
 * Batching rules:
 * - Sequential CREATE_TOKEN → BATCH_CREATE_TOKENS
 * - Sequential UPDATE_TOKEN_STATUS with same status → BATCH_UPDATE_STATUS
 * - Other decisions pass through unchanged
 * - Order is preserved for non-batchable decisions
 */

import type { CreateTokenParams } from '../operations/tokens.js';
import type { TokenStatus } from '../schemas.js';
import type { Decision } from '../types.js';

// ============================================================================
// Main Batching Entry Point
// ============================================================================

/**
 * Batch compatible decisions for optimized execution.
 *
 * Scans the decision list and combines adjacent compatible operations.
 * Non-batchable decisions are emitted immediately when encountered,
 * flushing any pending batch.
 */
export function batchDecisions(decisions: Decision[]): Decision[] {
  if (decisions.length === 0) {
    return [];
  }

  const result: Decision[] = [];
  let pendingCreates: CreateTokenParams[] = [];
  let pendingUpdates: Array<{ tokenId: string; status: TokenStatus }> = [];
  let pendingUpdateStatus: TokenStatus | null = null;

  const flushCreates = () => {
    if (pendingCreates.length === 0) return;

    if (pendingCreates.length === 1) {
      result.push({ type: 'CREATE_TOKEN', params: pendingCreates[0] });
    } else {
      result.push({ type: 'BATCH_CREATE_TOKENS', allParams: pendingCreates });
    }
    pendingCreates = [];
  };

  const flushUpdates = () => {
    if (pendingUpdates.length === 0) return;

    if (pendingUpdates.length === 1) {
      result.push({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: pendingUpdates[0].tokenId,
        status: pendingUpdates[0].status,
      });
    } else {
      result.push({ type: 'BATCH_UPDATE_STATUS', updates: pendingUpdates });
    }
    pendingUpdates = [];
    pendingUpdateStatus = null;
  };

  const flushAll = () => {
    flushCreates();
    flushUpdates();
  };

  for (const decision of decisions) {
    switch (decision.type) {
      case 'CREATE_TOKEN':
        // Flush updates before accumulating creates (maintain relative order)
        flushUpdates();
        pendingCreates.push(decision.params);
        break;

      case 'UPDATE_TOKEN_STATUS':
        // Flush creates before accumulating updates
        flushCreates();

        // Can only batch updates to the same status
        if (pendingUpdateStatus !== null && pendingUpdateStatus !== decision.status) {
          flushUpdates();
        }
        pendingUpdates.push({ tokenId: decision.tokenId, status: decision.status });
        pendingUpdateStatus = decision.status;
        break;

      case 'BATCH_CREATE_TOKENS':
        // Already batched - flush pending and pass through
        flushAll();
        result.push(decision);
        break;

      case 'BATCH_UPDATE_STATUS':
        // Already batched - flush pending and pass through
        flushAll();
        result.push(decision);
        break;

      default:
        // Non-batchable: flush pending and emit
        flushAll();
        result.push(decision);
        break;
    }
  }

  // Flush any remaining pending
  flushAll();

  return result;
}

// ============================================================================
// Batch Analysis Utilities
// ============================================================================

/**
 * Count how many decisions would result after batching.
 * Useful for metrics and logging.
 */
export function countBatchedDecisions(decisions: Decision[]): {
  original: number;
  batched: number;
  reduction: number;
} {
  const batched = batchDecisions(decisions);
  return {
    original: decisions.length,
    batched: batched.length,
    reduction: decisions.length - batched.length,
  };
}

/**
 * Check if a decision type is batchable.
 */
export function isBatchable(decision: Decision): boolean {
  return decision.type === 'CREATE_TOKEN' || decision.type === 'UPDATE_TOKEN_STATUS';
}

/**
 * Extract all token IDs affected by a list of decisions.
 * Useful for bulk operations or validation.
 */
export function extractAffectedTokenIds(decisions: Decision[]): string[] {
  const ids = new Set<string>();

  for (const d of decisions) {
    switch (d.type) {
      case 'CREATE_TOKEN':
        // Token ID not yet known (generated on create)
        break;
      case 'UPDATE_TOKEN_STATUS':
        ids.add(d.tokenId);
        break;
      case 'MARK_WAITING':
        ids.add(d.tokenId);
        break;
      case 'MARK_FOR_DISPATCH':
        ids.add(d.tokenId);
        break;
      case 'CHECK_SYNCHRONIZATION':
        ids.add(d.tokenId);
        break;
      case 'INIT_BRANCH_TABLE':
        ids.add(d.tokenId);
        break;
      case 'APPLY_BRANCH_OUTPUT':
        ids.add(d.tokenId);
        break;
      case 'BATCH_CREATE_TOKENS':
        // Token IDs not yet known
        break;
      case 'BATCH_UPDATE_STATUS':
        for (const u of d.updates) {
          ids.add(u.tokenId);
        }
        break;
      case 'MERGE_BRANCHES':
        for (const id of d.tokenIds) {
          ids.add(id);
        }
        break;
      case 'DROP_BRANCH_TABLES':
        for (const id of d.tokenIds) {
          ids.add(id);
        }
        break;
      case 'ACTIVATE_FAN_IN':
        for (const id of d.mergedTokenIds) {
          ids.add(id);
        }
        break;
      // Context and workflow decisions don't have token IDs
      case 'SET_CONTEXT':
      case 'APPLY_OUTPUT':
      case 'COMPLETE_WORKFLOW':
      case 'FAIL_WORKFLOW':
        break;
    }
  }

  return Array.from(ids);
}

/**
 * Group decisions by type for analysis.
 */
export function groupByType(decisions: Decision[]): Map<Decision['type'], Decision[]> {
  const groups = new Map<Decision['type'], Decision[]>();

  for (const d of decisions) {
    const existing = groups.get(d.type) ?? [];
    existing.push(d);
    groups.set(d.type, existing);
  }

  return groups;
}
