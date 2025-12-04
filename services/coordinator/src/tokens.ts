import { ulid } from 'ulid';

export type TokenStatus =
  | 'pending' // Created, not dispatched yet
  | 'dispatched' // Sent to executor
  | 'executing' // Executor acknowledged, running action
  | 'waiting_for_siblings' // At fan-in, waiting for synchronization
  | 'completed' // Successfully finished (terminal)
  | 'failed' // Execution error (terminal)
  | 'timed_out' // Exceeded timeout (terminal)
  | 'cancelled'; // Explicitly cancelled (terminal)

export interface TokenRow extends Record<string, SqlStorageValue> {
  id: string;
  workflow_run_id: string;
  node_id: string;
  status: string;
  path_id: string;
  parent_token_id: string | null;
  fan_out_transition_id: string | null; // Renamed from fan_out_node_id to match branching doc
  branch_index: number;
  branch_total: number;
  state_data: string | null; // JSON for state-specific data
  state_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTokenParams {
  workflow_run_id: string;
  node_id: string;
  parent_token_id: string | null;
  path_id: string;
  fan_out_transition_id: string | null;
  branch_index: number;
  branch_total: number;
}

/**
 * Initialize tokens table in SQLite storage
 */
export function initializeTokensTable(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      workflow_run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL,
      path_id TEXT NOT NULL,
      parent_token_id TEXT,
      fan_out_transition_id TEXT,
      branch_index INTEGER NOT NULL,
      branch_total INTEGER NOT NULL,
      state_data TEXT,
      state_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

/**
 * Create a new token for workflow execution
 */
export function createToken(sql: SqlStorage, params: CreateTokenParams): string {
  const token_id = ulid();
  const now = new Date().toISOString();

  sql.exec(
    `INSERT INTO tokens (
      id, workflow_run_id, node_id, status, path_id,
      parent_token_id, fan_out_transition_id, branch_index, branch_total,
      state_data, state_updated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    token_id,
    params.workflow_run_id,
    params.node_id,
    'pending',
    params.path_id,
    params.parent_token_id,
    params.fan_out_transition_id,
    params.branch_index,
    params.branch_total,
    null, // state_data
    now, // state_updated_at
    now, // created_at
    now, // updated_at
  );

  return token_id;
}

/**
 * Get token by ID
 */
export function getToken(sql: SqlStorage, token_id: string): TokenRow {
  const row = sql
    .exec<TokenRow>(
      `SELECT id, workflow_run_id, node_id, status, path_id, 
     parent_token_id, fan_out_transition_id, branch_index, branch_total,
     state_data, state_updated_at, created_at, updated_at 
     FROM tokens WHERE id = ?`,
      token_id,
    )
    .one();

  return row;
}

/**
 * Update token status
 */
export function updateTokenStatus(sql: SqlStorage, token_id: string, status: TokenStatus): void {
  const now = new Date().toISOString();
  sql.exec(`UPDATE tokens SET status = ?, updated_at = ? WHERE id = ?`, status, now, token_id);
}

/**
 * Get count of active (pending or executing) tokens for a workflow run
 */
export function getActiveTokenCount(sql: SqlStorage, workflow_run_id: string): number {
  const result = sql
    .exec(
      `SELECT COUNT(*) as count FROM tokens WHERE workflow_run_id = ? AND status IN ('pending', 'executing')`,
      workflow_run_id,
    )
    .one();

  return result.count as number;
}
