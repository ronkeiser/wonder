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
}
