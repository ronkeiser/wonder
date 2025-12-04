/**
 * Context Manager
 *
 * Manages schema-driven context storage in SQLite for workflow runs.
 * Handles main context in typed tables, branch outputs in JSON, and merge strategies.
 */

import { CustomTypeRegistry, DDLGenerator, DMLGenerator } from '@wonder/schema';
import type {
  Branch,
  BranchMergeConfig,
  ContextSchema,
  MergeResult,
  QueryResult,
  UpdateResult,
} from './types.js';

/**
 * ContextManager - manages workflow context in SQLite
 *
 * Architecture:
 * - Main context stored in typed SQLite tables (generated from schema)
 * - Branch outputs stored as JSON in _branches table
 * - No migrations - schema version locked at workflow start
 * - Single row per run, updated in place
 */
export class ContextManager {
  private schema: ContextSchema | null = null;
  private customTypes: CustomTypeRegistry;
  private ddlGenerator: DDLGenerator | null = null;
  private dmlGenerator: DMLGenerator | null = null;
  private mainTableName = 'context_state';

  constructor(private db: SqlStorage) {
    this.customTypes = new CustomTypeRegistry();
  }

  /**
   * Initialize context storage
   *
   * 1. Generates DDL from schema
   * 2. Creates typed tables for main context
   * 3. Creates _branches table for fan-out tracking
   * 4. Inserts initial context data
   *
   * @param schema - Context schema definition
   * @param initialData - Initial values for context.state
   */
  initializeContext(schema: ContextSchema, initialData: Record<string, unknown>): void {
    this.schema = schema;

    // Create DDL generator
    this.ddlGenerator = new DDLGenerator(schema.schema, this.customTypes, {
      nestedObjectStrategy: schema.options?.nestedObjectStrategy ?? 'flatten',
      arrayStrategy: schema.options?.arrayStrategy ?? 'table',
      arrayTablePrefix: '',
    });

    // Create DML generator
    this.dmlGenerator = new DMLGenerator(schema.schema, this.customTypes, {
      nestedObjectStrategy: schema.options?.nestedObjectStrategy ?? 'flatten',
      arrayStrategy: schema.options?.arrayStrategy ?? 'table',
      arrayTablePrefix: '',
    });

    // Generate and execute DDL for main context table(s)
    const ddl = this.ddlGenerator.generateDDL(this.mainTableName);
    const statements = ddl.split(';').filter((s: string) => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        this.db.exec(`${statement};`);
      }
    }

    // Create _branches table for fan-out tracking
    this.db.exec(`
			CREATE TABLE _branches (
				branch_index INTEGER NOT NULL,
				total_branches INTEGER NOT NULL,
				fan_out_node_id TEXT NOT NULL,
				token_id TEXT NOT NULL PRIMARY KEY,
				output TEXT, -- JSON
				created_at TEXT NOT NULL,
				completed_at TEXT
			);
		`);

    // Insert initial context data
    const insertResult = this.dmlGenerator.generateInsert(this.mainTableName, initialData);

    for (let i = 0; i < insertResult.statements.length; i++) {
      const statement = insertResult.statements[i];
      const values = insertResult.values[i];
      this.db.exec(statement, ...values);
    }
  }

  /**
   * Get full context object
   *
   * Reconstructs context from SQLite tables back to nested object structure.
   * Does not include branch data (_branches table is separate).
   *
   * @returns The full context.state object
   */
  getContext(): Record<string, unknown> {
    if (!this.schema || !this.ddlGenerator) {
      throw new Error('Context not initialized');
    }

    // Query main table
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `SELECT * FROM ${this.mainTableName} LIMIT 1`,
    );
    const result = cursor.one();

    if (!result) {
      return {};
    }

    // Reconstruct object from flattened columns
    return this.reconstructObject(result);
  }

  /**
   * Update context at specific path
   *
   * Generates and executes DML UPDATE for the given path.
   *
   * @param path - JSON pointer path (e.g., '/user/name' or '/items/0/status')
   * @param value - New value to set
   * @returns Update result with success/error
   */
  updateContext(path: string, value: unknown): UpdateResult {
    if (!this.dmlGenerator) {
      return { success: false, error: 'Context not initialized' };
    }

    try {
      // Convert path to update object
      // e.g., '/user/name' -> { user: { name: value } }
      const updateData = this.pathToObject(path, value);

      // Generate UPDATE statement
      const updateResult = this.dmlGenerator.generateUpdate(
        this.mainTableName,
        updateData,
        'rowid = (SELECT rowid FROM context_state LIMIT 1)',
      );

      // Execute statements
      for (let i = 0; i < updateResult.statements.length; i++) {
        const statement = updateResult.statements[i];
        const values = updateResult.values[i];
        this.db.exec(statement, ...values);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Query context at specific path
   *
   * Used by transition conditions to evaluate against context.
   *
   * @param path - JSON pointer path (e.g., '/status' or '/user/email')
   * @returns Query result with value or error
   */
  queryContext(path: string): QueryResult {
    try {
      const context = this.getContext();
      const value = this.getValueAtPath(context, path);

      return { success: true, value };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Record new branch from fan-out
   *
   * @param branch - Branch tracking data
   */
  recordBranch(branch: Omit<Branch, 'output' | 'completed_at'>): void {
    this.db.exec(
      `
			INSERT INTO _branches (branch_index, total_branches, fan_out_node_id, token_id, created_at)
			VALUES (?, ?, ?, ?, ?)
		`,
      branch.index,
      branch.total,
      branch.fan_out_node_id,
      branch.token_id,
      branch.created_at,
    );
  }

  /**
   * Update branch output when node completes
   *
   * @param tokenId - Token ID of the branch
   * @param output - Output from the branch's output_mapping
   * @param completedAt - Completion timestamp
   */
  updateBranchOutput(tokenId: string, output: Record<string, unknown>, completedAt: string): void {
    this.db.exec(
      `
			UPDATE _branches
			SET output = ?, completed_at = ?
			WHERE token_id = ?
		`,
      JSON.stringify(output),
      completedAt,
      tokenId,
    );
  }

  /**
   * Get branches by fan-out node
   *
   * @param fanOutNodeId - Node ID that created the branches
   * @returns Array of branch records
   */
  getBranches(fanOutNodeId: string): Branch[] {
    const cursor = this.db.exec<Record<string, SqlStorageValue>>(
      `
			SELECT * FROM _branches
			WHERE fan_out_node_id = ?
			ORDER BY branch_index ASC
		`,
      fanOutNodeId,
    );

    const results = cursor.toArray();

    return results.map((row: Record<string, SqlStorageValue>) => ({
      index: row.branch_index as number,
      total: row.total_branches as number,
      fan_out_node_id: row.fan_out_node_id as string,
      token_id: row.token_id as string,
      output: row.output ? (JSON.parse(row.output as string) as Record<string, unknown>) : null,
      created_at: row.created_at as string,
      completed_at: (row.completed_at as string) || null,
    }));
  }

  /**
   * Apply merge strategy for fan-in
   *
   * Takes branch outputs and merges them according to strategy,
   * writing result to context.state[config.target].
   *
   * @param fanOutNodeId - Node ID that created the branches
   * @param config - Merge configuration
   * @returns Merge result with merged value or error
   */
  applyMergeStrategy(fanOutNodeId: string, config: BranchMergeConfig): MergeResult {
    try {
      // Get all branches
      const branches = this.getBranches(fanOutNodeId);

      // Filter completed branches with outputs
      const completedBranches = branches.filter((b) => b.completed_at && b.output);

      if (completedBranches.length === 0) {
        return { success: false, error: 'No completed branches to merge' };
      }

      // Apply merge strategy
      let mergedValue: unknown;

      switch (config.strategy) {
        case 'collect':
          // Array of all branch outputs
          mergedValue = completedBranches.map((b) => b.output);
          break;

        case 'first':
          // First branch's output
          mergedValue = completedBranches[0].output;
          break;

        case 'reduce':
          // Custom reduce function
          if (!config.reduceFn) {
            return { success: false, error: 'reduce strategy requires reduceFn' };
          }
          mergedValue = completedBranches.reduce(
            (acc: unknown, branch, index) => config.reduceFn!(acc, branch.output, index),
            undefined as unknown,
          );
          break;

        case 'custom':
          // Custom merge function
          if (!config.customMergeFn) {
            return { success: false, error: 'custom strategy requires customMergeFn' };
          }
          mergedValue = config.customMergeFn(completedBranches);
          break;

        default:
          return { success: false, error: `Unknown merge strategy: ${config.strategy}` };
      }

      // Write merged value to context
      const updateResult = this.updateContext(config.target, mergedValue);

      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      // Clean up branch records
      this.db.exec(
        `
				DELETE FROM _branches
				WHERE fan_out_node_id = ?
			`,
        fanOutNodeId,
      );

      return { success: true, value: mergedValue };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reconstruct nested object from flattened columns
   *
   * Converts flat column structure (e.g., user_name, user_email)
   * back to nested object (e.g., { user: { name, email } })
   */
  private reconstructObject(row: Record<string, SqlStorageValue>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      // Skip SQLite internal columns
      if (key === 'rowid' || key === '_rowid_' || key === 'oid') {
        continue;
      }

      // Handle flattened nested objects (user_name -> user.name)
      const parts = key.split('_');
      if (parts.length > 1) {
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Convert JSON pointer path to nested object
   *
   * e.g., '/user/name' + 'John' -> { user: { name: 'John' } }
   */
  private pathToObject(path: string, value: unknown): Record<string, unknown> {
    const parts = path.split('/').filter((p) => p);

    if (parts.length === 0) {
      return { value } as Record<string, unknown>;
    }

    let current: Record<string, unknown> = {};
    const root = current;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    return root;
  }

  /**
   * Get value at JSON pointer path
   *
   * e.g., '/user/name' in { user: { name: 'John' } } -> 'John'
   */
  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('/').filter((p) => p);

    let current: unknown = obj;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
