/** Type definitions for tools */

import { tools } from '../../schema';

// ============================================================================
// Embedded JSON Types (explicit - used by schema via .$type<T>())
// ============================================================================

/**
 * Retry configuration for tools
 */
export type ToolRetryConfig = {
  maxAttempts: number;
  backoffMs: number;
  timeoutMs: number;
};

/**
 * Tool target type
 */
export type ToolTargetType = 'task' | 'workflow' | 'agent';

/**
 * Invocation mode for agent targets
 */
export type ToolInvocationMode = 'delegate' | 'loop_in';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Tool entity - inferred from database schema */
export type Tool = typeof tools.$inferSelect;

// ============================================================================
// API DTOs (inferred from schema with API-specific modifications)
// ============================================================================

import type { NewEntity } from '~/shared/types';

/** Base input for creating a tool - inferred from schema */
type ToolInsert = NewEntity<typeof tools.$inferInsert>;

/** API input for creating a tool */
export type ToolInput = ToolInsert;
