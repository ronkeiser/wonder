/**
 * Token Manager
 *
 * Manages token lifecycle and state in SQLite for workflow execution.
 * Tokens represent positions in the workflow graph and track execution flow.
 */

import { CustomTypeRegistry, DDLGenerator, DMLGenerator } from '@wonder/schema';
import type { NewToken, Token } from './types';
import { TOKEN_SCHEMA } from './types';

/**
 * TokenManager - manages workflow tokens in SQLite
 *
 * Responsibilities:
 * - Create tokens (workflow start, fan-out)
 * - Update token status (active → waiting → completed/cancelled)
 * - Query tokens (by ID, by node, by status)
 * - Track fan-out/fan-in relationships
 */
export class TokenManager {
  private customTypes: CustomTypeRegistry;
  private ddlGenerator: DDLGenerator;
  private dmlGenerator: DMLGenerator;
  private tableName = 'tokens';
  private initialized = false;

  constructor(private db: SqlStorage) {
    this.customTypes = new CustomTypeRegistry();
    this.ddlGenerator = new DDLGenerator(TOKEN_SCHEMA, this.customTypes, {
      nestedObjectStrategy: 'flatten',
      arrayStrategy: 'json',
    });
    this.dmlGenerator = new DMLGenerator(TOKEN_SCHEMA, this.customTypes, {
      nestedObjectStrategy: 'flatten',
      arrayStrategy: 'json',
    });
  }

  /**
   * Initialize token storage
   *
   * Creates the tokens table in SQLite.
   * Should be called once when the DO is first created.
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    const ddl = this.ddlGenerator.generateDDL(this.tableName);
    const statements = ddl.split(';').filter((s: string) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        this.db.exec(`${statement};`);
      }
    }

    this.initialized = true;
  }

  /**
   * Create a new token
   *
   * @param token - New token data
   * @returns Created token with generated ID and timestamps
   */
  createToken(token: NewToken): Token {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const fullToken: Token = {
      ...token,
      id,
      created_at: now,
      updated_at: now,
    };

    const { statements, values } = this.dmlGenerator.generateInsert(this.tableName, fullToken);

    for (let i = 0; i < statements.length; i++) {
      this.db.exec(statements[i], ...values[i]);
    }

    return fullToken;
  }

  /**
   * Get token by ID
   *
   * @param tokenId - Token ID
   * @returns Token or null if not found
   */
  getToken(tokenId: string): Token | null {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`,
      tokenId,
    );

    try {
      const row = cursor.one();
      return this.rowToToken(row);
    } catch {
      return null;
    }
  }

  /**
   * Get all tokens for a workflow run
   *
   * @param workflowRunId - Workflow run ID
   * @returns Array of tokens
   */
  getTokensByWorkflowRun(workflowRunId: string): Token[] {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `SELECT * FROM ${this.tableName} WHERE workflow_run_id = ? ORDER BY created_at ASC`,
      workflowRunId,
    );

    return cursor.toArray().map((row) => this.rowToToken(row));
  }

  /**
   * Get active tokens for a workflow run
   *
   * @param workflowRunId - Workflow run ID
   * @returns Array of active tokens
   */
  getActiveTokens(workflowRunId: string): Token[] {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `SELECT * FROM ${this.tableName} WHERE workflow_run_id = ? AND status = ? ORDER BY created_at ASC`,
      workflowRunId,
      'active',
    );

    return cursor.toArray().map((row) => this.rowToToken(row));
  }

  /**
   * Get tokens waiting at a fan-in node
   *
   * @param workflowRunId - Workflow run ID
   * @param fanOutNodeId - Node ID that created the fan-out
   * @returns Array of waiting tokens
   */
  getWaitingTokens(workflowRunId: string, fanOutNodeId: string): Token[] {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `
			SELECT * FROM ${this.tableName}
			WHERE workflow_run_id = ?
			AND fan_out_node_id = ?
			AND status = ?
			ORDER BY branch_index ASC
		`,
      workflowRunId,
      fanOutNodeId,
      'waiting_at_fan_in',
    );

    return cursor.toArray().map((row) => this.rowToToken(row));
  }

  /**
   * Get all sibling tokens from same fan-out
   *
   * @param workflowRunId - Workflow run ID
   * @param fanOutNodeId - Node ID that created the fan-out
   * @returns Array of sibling tokens (all branches)
   */
  getSiblingTokens(workflowRunId: string, fanOutNodeId: string): Token[] {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `
			SELECT * FROM ${this.tableName}
			WHERE workflow_run_id = ?
			AND fan_out_node_id = ?
			ORDER BY branch_index ASC
		`,
      workflowRunId,
      fanOutNodeId,
    );

    return cursor.toArray().map((row) => this.rowToToken(row));
  }

  /**
   * Update token status
   *
   * @param tokenId - Token ID
   * @param status - New status
   */
  updateStatus(tokenId: string, status: Token['status']): void {
    this.db.exec(
      `
			UPDATE ${this.tableName}
			SET status = ?, updated_at = ?
			WHERE id = ?
		`,
      status,
      new Date().toISOString(),
      tokenId,
    );
  }

  /**
   * Update token node position
   *
   * Used when token transitions to a new node.
   *
   * @param tokenId - Token ID
   * @param nodeId - New node ID
   */
  updateNode(tokenId: string, nodeId: string): void {
    this.db.exec(
      `
			UPDATE ${this.tableName}
			SET node_id = ?, updated_at = ?
			WHERE id = ?
		`,
      nodeId,
      new Date().toISOString(),
      tokenId,
    );
  }

  /**
   * Cancel tokens
   *
   * Used for early completion in m_of_n fan-in or workflow failure.
   *
   * @param tokenIds - Array of token IDs to cancel
   */
  cancelTokens(tokenIds: string[]): void {
    if (tokenIds.length === 0) {
      return;
    }

    const placeholders = tokenIds.map(() => '?').join(',');
    this.db.exec(
      `
			UPDATE ${this.tableName}
			SET status = ?, updated_at = ?
			WHERE id IN (${placeholders})
		`,
      'cancelled',
      new Date().toISOString(),
      ...tokenIds,
    );
  }

  /**
   * Delete all tokens for a workflow run
   *
   * Used when cleaning up after workflow completion.
   *
   * @param workflowRunId - Workflow run ID
   */
  deleteTokens(workflowRunId: string): void {
    this.db.exec(`DELETE FROM ${this.tableName} WHERE workflow_run_id = ?`, workflowRunId);
  }

  /**
   * Check if all tokens are terminal
   *
   * Terminal = completed or cancelled
   *
   * @param workflowRunId - Workflow run ID
   * @returns True if all tokens are in terminal state
   */
  allTokensTerminal(workflowRunId: string): boolean {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `
			SELECT COUNT(*) as count FROM ${this.tableName}
			WHERE workflow_run_id = ?
			AND status NOT IN (?, ?)
		`,
      workflowRunId,
      'completed',
      'cancelled',
    );

    const row = cursor.one();
    return (row.count as number) === 0;
  }

  /**
   * Convert SQLite row to Token
   */
  private rowToToken(row: Record<string, SqlStorageValue>): Token {
    return {
      id: row.id as string,
      workflow_run_id: row.workflow_run_id as string,
      node_id: row.node_id as string,
      status: row.status as Token['status'],
      path_id: row.path_id as string,
      parent_token_id: (row.parent_token_id as string) || null,
      fan_out_node_id: (row.fan_out_node_id as string) || null,
      branch_index: row.branch_index as number,
      branch_total: row.branch_total as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
