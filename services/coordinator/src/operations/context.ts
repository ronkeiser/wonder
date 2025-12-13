/**
 * Context Operations
 *
 * Schema-driven SQL operations for workflow context and branch storage.
 * Uses @wonder/context Schema and SchemaTable for table lifecycle and data operations.
 *
 * Structure:
 *
 * Main context operations:
 *   - initialize(input) - Create context tables and store input
 *   - get(path) - Read value from context
 *   - set(path, value) - Write value to context
 *   - getSnapshot() - Read-only view for decision logic
 *   - applyNodeOutput(output) - Write validated output
 *
 * Branch storage operations (for parallel execution):
 *   - initializeBranchTable(tokenId, schema) - Create branch_output_{tokenId} table
 *   - applyBranchOutput(tokenId, output) - Write task output to branch table
 *   - getBranchOutputs(tokenIds) - Read outputs from sibling branch tables
 *   - mergeBranches(siblings, merge) - Merge branch outputs into main context
 *   - dropBranchTables(tokenIds) - Cleanup branch tables after merge
 *
 * Branch storage design:
 *   - Each token gets separate ephemeral tables prefixed by token ID
 *   - Isolation through table namespacing, not row filtering
 *   - Branch tables created on fan-out, dropped after fan-in merge
 *   - Schema comes from TaskDef.output_schema (via node.task_id)
 *
 * See docs/architecture/branch-storage.md for complete design.
 */

import { Schema, type JSONSchema, type SchemaTable } from '@wonder/context';
import type { Emitter } from '@wonder/events';
import type { ContextSnapshot } from '../types.js';
import type { DefinitionManager } from './defs.js';

/** Merge configuration for fan-in */
export type MergeConfig = {
  source: string;
  target: string;
  strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
};

/** Branch output with metadata */
export type BranchOutput = {
  tokenId: string;
  branchIndex: number;
  output: Record<string, unknown>;
};

/**
 * ContextManager manages runtime state for a workflow execution.
 *
 * Uses Schema from @wonder/context for validation and SQL generation,
 * with SchemaTable for bound execution against context tables.
 */
export class ContextManager {
  private readonly sql: SqlStorage;
  private readonly defs: DefinitionManager;
  private readonly emitter: Emitter;

  /** Bound schema tables (lazy initialized) */
  private inputTable: SchemaTable | null = null;
  private stateTable: SchemaTable | null = null;
  private outputTable: SchemaTable | null = null;

  /** Track initialization */
  private initialized = false;

  constructor(sql: SqlStorage, defs: DefinitionManager, emitter: Emitter) {
    this.sql = sql;
    this.defs = defs;
    this.emitter = emitter;
  }

  /**
   * Load schemas and bind tables (lazy initialization)
   */
  private loadSchemas(): void {
    if (this.initialized) return;

    const workflowDef = this.defs.getWorkflowDef();

    const inputSchema = new Schema(workflowDef.input_schema as JSONSchema);
    const outputSchema = new Schema(workflowDef.output_schema as JSONSchema);

    this.inputTable = inputSchema.bind(this.sql, 'context_input');
    this.outputTable = outputSchema.bind(this.sql, 'context_output');

    if (workflowDef.context_schema) {
      const stateSchema = new Schema(workflowDef.context_schema as JSONSchema);
      this.stateTable = stateSchema.bind(this.sql, 'context_state');
    }

    this.initialized = true;
  }

  /**
   * Initialize context tables and store input
   */
  async initialize(input: Record<string, unknown>): Promise<void> {
    this.loadSchemas();

    const tablesCreated: string[] = [];

    // Create tables
    this.inputTable!.create();
    tablesCreated.push('context_input');

    if (this.stateTable) {
      this.stateTable.create();
      tablesCreated.push('context_state');
    }

    this.outputTable!.create();
    tablesCreated.push('context_output');

    this.emitter.emitTrace({
      type: 'operation.context.initialize',
      has_input_schema: true,
      has_context_schema: this.stateTable !== null,
      table_count: tablesCreated.length,
      tables_created: tablesCreated,
    });

    // Validate and store input
    const result = this.inputTable!.validate(input);

    this.emitter.emitTrace({
      type: 'operation.context.validate',
      path: 'input',
      schema_type: 'object',
      valid: result.valid,
      error_count: result.errors.length,
      errors: result.errors.slice(0, 5).map((e) => e.message),
    });

    if (!result.valid) {
      throw new Error(`Input validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    this.inputTable!.insert(input);

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path: 'input',
      value: input,
    });
  }

  /**
   * Read value from context
   */
  get(path: string): unknown {
    this.loadSchemas();

    const table = this.getTable(path);
    const value = table?.selectFirst() ?? {};

    this.emitter.emitTrace({
      type: 'operation.context.read',
      path,
      value,
    });

    return value;
  }

  /**
   * Write value to context
   */
  set(path: string, value: unknown): void {
    this.loadSchemas();

    const [section] = path.split('.');

    if (section !== 'state' && section !== 'output') {
      throw new Error(`Cannot write to ${section} - only 'state' and 'output' are writable`);
    }

    const table = this.getTable(section);

    if (typeof value === 'object' && value !== null && table) {
      table.replace(value as Record<string, unknown>);
    } else {
      table?.deleteAll();
    }

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path,
      value,
    });
  }

  /**
   * Apply validated output to context
   */
  async applyNodeOutput(output: Record<string, unknown>): Promise<void> {
    this.loadSchemas();

    const result = this.outputTable!.validate(output);

    this.emitter.emitTrace({
      type: 'operation.context.validate',
      path: 'output',
      schema_type: 'object',
      valid: result.valid,
      error_count: result.errors.length,
      errors: result.errors.slice(0, 5).map((e) => e.message),
    });

    if (!result.valid) {
      throw new Error(
        `Output validation failed: ${result.errors.map((e) => e.message).join(', ')}`,
      );
    }

    this.outputTable!.replace(output);

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path: 'output',
      value: output,
    });
  }

  /**
   * Get read-only snapshot of entire context
   */
  getSnapshot(): ContextSnapshot {
    const snapshot = {
      input: (this.get('input') as Record<string, unknown>) || {},
      state: (this.get('state') as Record<string, unknown>) || {},
      output: (this.get('output') as Record<string, unknown>) || {},
    };

    this.emitter.emitTrace({
      type: 'operation.context.snapshot',
      snapshot,
    });

    return snapshot;
  }

  /** Get table by path */
  private getTable(path: string): SchemaTable | null {
    switch (path) {
      case 'input':
        return this.inputTable;
      case 'state':
        return this.stateTable;
      case 'output':
        return this.outputTable;
      default:
        return null;
    }
  }

  // ============================================================================
  // Branch Storage Operations (for parallel execution)
  // ============================================================================

  /** Cache of branch tables by token ID */
  private branchTables = new Map<string, SchemaTable>();

  /**
   * Create a branch output table for a token
   * Called during fan-out when token is created
   */
  initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void {
    const tableName = `branch_output_${tokenId}`;
    const schema = new Schema(outputSchema);
    const table = schema.bind(this.sql, tableName);

    table.create();
    this.branchTables.set(tokenId, table);

    this.emitter.emitTrace({
      type: 'operation.context.branch_table.create',
      token_id: tokenId,
      table_name: tableName,
      schema_type: outputSchema.type as string,
    });
  }

  /**
   * Write task output to a token's branch table
   * Called when task completes during fan-out execution
   */
  applyBranchOutput(tokenId: string, output: Record<string, unknown>): void {
    const table = this.branchTables.get(tokenId);

    if (!table) {
      throw new Error(`Branch table not found for token ${tokenId}`);
    }

    const result = table.validate(output);

    this.emitter.emitTrace({
      type: 'operation.context.branch.validate',
      token_id: tokenId,
      valid: result.valid,
      error_count: result.errors.length,
      errors: result.errors.slice(0, 5).map((e) => e.message),
    });

    if (!result.valid) {
      throw new Error(
        `Branch output validation failed: ${result.errors.map((e) => e.message).join(', ')}`,
      );
    }

    table.insert(output);

    this.emitter.emitTrace({
      type: 'operation.context.branch.write',
      token_id: tokenId,
      output,
    });
  }

  /**
   * Read outputs from sibling branch tables
   * Called during fan-in to collect all branch results
   */
  getBranchOutputs(
    tokenIds: string[],
    branchIndices: number[],
    outputSchema: JSONSchema,
  ): BranchOutput[] {
    const outputs: BranchOutput[] = [];

    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      const branchIndex = branchIndices[i];

      // Get cached table or create reader for existing table
      let table = this.branchTables.get(tokenId);

      if (!table) {
        const tableName = `branch_output_${tokenId}`;
        const schema = new Schema(outputSchema);
        table = schema.bind(this.sql, tableName);
      }

      const output = table.selectFirst() ?? {};

      outputs.push({
        tokenId,
        branchIndex,
        output,
      });
    }

    this.emitter.emitTrace({
      type: 'operation.context.branch.read_all',
      token_ids: tokenIds,
      output_count: outputs.length,
    });

    return outputs;
  }

  /**
   * Merge branch outputs into main context
   * Called at fan-in after synchronization condition is met
   */
  mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void {
    // Extract outputs based on source path
    const extractedOutputs = branchOutputs.map((b) => {
      if (merge.source === '_branch.output') {
        return b;
      }
      // Extract nested path from output (e.g., '_branch.output.choice')
      const path = merge.source.replace('_branch.output.', '');
      return {
        ...b,
        output: { [path]: this.getNestedValue(b.output, path) },
      };
    });

    // Apply merge strategy
    let merged: unknown;

    switch (merge.strategy) {
      case 'append':
        // Collect all outputs into array, ordered by branch index
        merged = extractedOutputs
          .sort((a, b) => a.branchIndex - b.branchIndex)
          .map((b) => b.output);
        break;

      case 'merge_object':
        // Shallow merge all outputs (last wins for conflicts)
        merged = Object.assign({}, ...extractedOutputs.map((b) => b.output));
        break;

      case 'keyed_by_branch':
        // Object keyed by branch index
        merged = Object.fromEntries(
          extractedOutputs.map((b) => [b.branchIndex.toString(), b.output]),
        );
        break;

      case 'last_wins':
        // Take last completed (highest branch index)
        const sorted = extractedOutputs.sort((a, b) => b.branchIndex - a.branchIndex);
        merged = sorted[0]?.output ?? {};
        break;
    }

    // Write to target path in context
    this.set(merge.target, merged);

    this.emitter.emitTrace({
      type: 'operation.context.merge.complete',
      target_path: merge.target,
      branch_count: branchOutputs.length,
    });
  }

  /**
   * Drop branch tables after merge (cleanup)
   */
  dropBranchTables(tokenIds: string[]): void {
    for (const tokenId of tokenIds) {
      const tableName = `branch_output_${tokenId}`;

      // Drop the table
      this.sql.exec(`DROP TABLE IF EXISTS ${tableName};`);

      // Remove from cache
      this.branchTables.delete(tokenId);
    }

    this.emitter.emitTrace({
      type: 'operation.context.branch_table.drop',
      token_ids: tokenIds,
      tables_dropped: tokenIds.length,
    });
  }

  /** Get nested value from object by dot-separated path */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
