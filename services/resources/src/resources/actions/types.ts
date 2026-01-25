/** Type definitions for actions */

// ============================================================================
// Enums
// ============================================================================

export type ActionKind =
  | 'llm'
  | 'mcp'
  | 'http'
  | 'human'
  | 'context'
  | 'artifact'
  | 'vector'
  | 'metric'
  | 'mock';

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Action entity - the API-facing shape.
 * Internally stored in the unified `definitions` table.
 */
export type Action = {
  id: string;
  version: number;
  name: string;
  description: string;
  reference: string;
  kind: ActionKind;
  implementation: object;
  requires: object | null;
  produces: object | null;
  execution: object | null;
  idempotency: object | null;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// API DTOs
// ============================================================================

/**
 * API input for creating an action.
 */
export type ActionInput = {
  name: string;
  description?: string;
  reference?: string;
  kind: ActionKind;
  implementation: Record<string, unknown>;
  requires?: Record<string, unknown> | null;
  produces?: Record<string, unknown> | null;
  execution?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
  autoversion?: boolean;
};
