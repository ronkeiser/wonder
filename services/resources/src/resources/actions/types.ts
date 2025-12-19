/** Type definitions for actions */

import { actions } from '../../schema';

// ============================================================================
// Enums (explicit - used by schema via .$type<T>())
// ============================================================================

export type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric'
  | 'mock';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Action entity - inferred from database schema */
export type Action = typeof actions.$inferSelect;

// ============================================================================
// API DTOs (explicit - have fields not in DB)
// ============================================================================

export type ActionInput = {
  version?: number;
  name: string;
  description?: string;
  kind: ActionKind;
  implementation: object;
  requires?: object;
  produces?: object;
  execution?: object;
  idempotency?: object;
  autoversion?: boolean;
};
