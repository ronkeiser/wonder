/**
 * Token Operations
 *
 * Direct SQL operations for token state management.
 */

import type { Emitter } from '@wonder/events';
import { ulid } from 'ulid';
import type { CreateTokenParams, TokenRow, TokenStatus } from '../types.js';
import type { DefinitionManager } from './defs.js';

/**
 * TokenManager manages token state for a workflow execution.
 *
 * Encapsulates SQL operations for token lifecycle management including
 * creation, status updates, and queries.
 */
export class TokenManager {
  private readonly sql: SqlStorage;
  private readonly defs: DefinitionManager;
  private readonly emitter: Emitter;

  constructor(sql: SqlStorage, defs: DefinitionManager, emitter: Emitter) {
    this.sql = sql;
    this.defs = defs;
    this.emitter = emitter;
  }

  /**
   * Initialize tokens table
   */
  initialize(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        parent_token_id TEXT,
        path_id TEXT NOT NULL,
        fan_out_transition_id TEXT,
        branch_index INTEGER NOT NULL,
        branch_total INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_tokens_workflow_run 
      ON tokens(workflow_run_id);
    `);

    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_tokens_status 
      ON tokens(status);
    `);
  }

  /**
   * Create a new token
   */
  create(params: CreateTokenParams): string {
    const tokenId = ulid();
    const now = Date.now();

    this.sql.exec(
      `
      INSERT INTO tokens (
        id, workflow_run_id, node_id, status,
        parent_token_id, path_id, fan_out_transition_id,
        branch_index, branch_total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
      tokenId,
      params.workflow_run_id,
      params.node_id,
      'pending',
      params.parent_token_id,
      params.path_id,
      params.fan_out_transition_id,
      params.branch_index,
      params.branch_total,
      now,
      now,
    );

    this.emitter.emitTrace({
      type: 'operation.tokens.create',
      token_id: tokenId,
      node_id: params.node_id,
      task_id: params.node_id, // Task ID is currently the same as node ID
      parent_token_id: params.parent_token_id,
    });

    return tokenId;
  }

  /**
   * Get token by ID
   */
  get(tokenId: string): TokenRow {
    const result = this.sql.exec<TokenRow>(
      `
      SELECT * FROM tokens WHERE id = ?;
    `,
      tokenId,
    );

    const rows = [...result];
    if (rows.length === 0) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    return rows[0];
  }

  /**
   * Update token status
   */
  updateStatus(tokenId: string, status: TokenStatus): void {
    const token = this.get(tokenId);

    this.sql.exec(
      `
      UPDATE tokens 
      SET status = ?, updated_at = ? 
      WHERE id = ?;
    `,
      status,
      Date.now(),
      tokenId,
    );

    this.emitter.emitTrace({
      type: 'operation.tokens.update_status',
      token_id: tokenId,
      from: token.status,
      to: status,
    });
  }

  /**
   * Count active tokens for a workflow run
   */
  getActiveCount(workflowRunId: string): number {
    const result = this.sql.exec<{ count: number }>(
      `
      SELECT COUNT(*) as count 
      FROM tokens 
      WHERE workflow_run_id = ? 
      AND status IN ('pending', 'dispatched', 'executing');
    `,
      workflowRunId,
    );

    const rows = [...result];
    return rows[0]?.count ?? 0;
  }
}
