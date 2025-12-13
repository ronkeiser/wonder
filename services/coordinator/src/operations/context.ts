/**
 * Context Operations
 *
 * Schema-driven SQL operations for workflow context and branch storage.
 * Uses @wonder/context primitives (DDLGenerator, DMLGenerator, Validator)
 * to manage both main context tables and branch-isolated tables during
 * parallel execution.
 *
 * Structure:
 *
 * Main context operations:
 *   - initialize() - Create main context tables from workflow schema
 *   - initializeWithInput(input) - Validate and insert input data
 *   - get(path) - Read value from main context
 *   - set(path, value) - Write value to main context
 *   - getSnapshot() - Read-only view for decision logic
 *
 * Branch storage operations (extensions for parallel execution - future):
 *   - initializeBranchTable(tokenId, schema) - Create branch_output_{tokenId} tables
 *   - applyNodeOutput(tokenId, output, schema) - Write task output to branch table
 *   - getBranchOutputs(tokenIds, schema) - Read outputs from sibling branch tables
 *   - mergeBranches(siblings, merge, schema) - Merge branch outputs into main context
 *   - dropBranchTables(tokenIds) - Cleanup branch tables after merge
 *
 * Branch storage design:
 *   - Each token gets separate ephemeral tables prefixed by token ID
 *   - Isolation through table namespacing, not row filtering
 *   - Branch tables created on fan-out, dropped after fan-in merge
 *   - Nested fan-outs create hierarchical branch tables
 *
 * See docs/architecture/branch-storage.md for complete design.
 */

import type { JSONSchema } from '@wonder/context';
import { ContextExecutor, CustomTypeRegistry, DMLGenerator, Validator } from '@wonder/context';
import type { Emitter } from '@wonder/events';
import type { ContextSnapshot } from '../types.js';
import type { DefinitionManager } from './defs.js';

/**
 * ContextManager manages runtime state for a workflow execution.
 *
 * Encapsulates schema-driven SQL operations with caching for validators
 * and generators. Schemas are loaded from definitions on-demand.
 */
export class ContextManager {
  private readonly defs: DefinitionManager;
  private readonly emitter: Emitter;
  private readonly customTypes: CustomTypeRegistry;
  private readonly executor: ContextExecutor;

  /** Cached schemas loaded from definitions */
  private inputSchema: JSONSchema | null = null;
  private contextSchema: JSONSchema | null = null;
  private outputSchema: JSONSchema | null = null;

  /** Cached validators */
  private inputValidator: Validator | null = null;
  private outputValidator: Validator | null = null;

  /** Cached DML generators */
  private inputDMLGenerator: DMLGenerator | null = null;
  private outputDMLGenerator: DMLGenerator | null = null;

  constructor(sql: SqlStorage, defs: DefinitionManager, emitter: Emitter) {
    this.defs = defs;
    this.emitter = emitter;
    this.customTypes = new CustomTypeRegistry();
    this.executor = new ContextExecutor(sql, this.customTypes);
  }

  /**
   * Load schemas from definitions (lazy initialization)
   */
  private async loadSchemas(): Promise<void> {
    if (this.inputSchema !== null) {
      // Already loaded
      return;
    }

    const workflowDef = this.defs.getWorkflowDef();

    this.inputSchema = workflowDef.input_schema as JSONSchema;
    this.contextSchema = (workflowDef.context_schema as JSONSchema) ?? null;
    this.outputSchema = workflowDef.output_schema as JSONSchema;
  }

  /**
   * Initialize main context tables from workflow schemas and store input
   */
  async initialize(input: Record<string, unknown>): Promise<void> {
    await this.loadSchemas();

    const tablesCreated: string[] = [];

    // Drop existing tables to ensure clean schema
    this.executor.dropTable('context_input');
    this.executor.dropTable('context_state');
    this.executor.dropTable('context_output');

    // Create input table
    if (this.inputSchema!.type === 'object') {
      this.executor.createTable(this.inputSchema!, 'context_input');
      tablesCreated.push('context_input');
    }

    // Create state table if context schema provided
    if (this.contextSchema?.type === 'object') {
      this.executor.createTable(this.contextSchema, 'context_state');
      tablesCreated.push('context_state');
    }

    // Create output table from output schema
    if (this.outputSchema!.type === 'object') {
      this.executor.createTable(this.outputSchema!, 'context_output');
      tablesCreated.push('context_output');
    }

    this.emitter.emitTrace({
      type: 'operation.context.initialize',
      has_input_schema: this.inputSchema!.type === 'object',
      has_context_schema: this.contextSchema?.type === 'object',
      table_count: tablesCreated.length,
      tables_created: tablesCreated,
    });

    // Validate and store input
    await this.storeInput(input);
  }

  /**
   * Validate and store input data (internal)
   */
  private async storeInput(input: Record<string, unknown>): Promise<void> {
    await this.loadSchemas();

    // Lazy-initialize validator
    if (!this.inputValidator) {
      this.inputValidator = new Validator(this.inputSchema!, this.customTypes);
    }

    const result = this.inputValidator.validate(input);

    this.emitter.emitTrace({
      type: 'operation.context.validate',
      path: 'input',
      schema_type: this.inputSchema!.type || 'unknown',
      valid: result.valid,
      error_count: result.errors.length,
      errors: result.errors.slice(0, 5).map((e) => e.message), // First 5 errors
    });

    if (!result.valid) {
      throw new Error(`Input validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    this.executor.insert(this.inputSchema!, 'context_input', input);

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path: 'input',
      value: input,
    });
  }

  /**
   * Read value from context at JSONPath
   * TODO: Support nested JSONPath reading (e.g., 'state.votes[0].choice')
   */
  get(path: string): unknown {
    // For now, only support reading 'input', 'state', 'output'
    const tableName = `context_${path}`;
    const value = this.executor.selectFirst(tableName) ?? {};

    this.emitter.emitTrace({
      type: 'operation.context.read',
      path,
      value,
    });

    return value;
  }

  /**
   * Write value to context at JSONPath
   * TODO: Support nested JSONPath updates without full table clear
   */
  set(path: string, value: unknown): void {
    // For now, only support writing to 'state' or 'output'
    const [section] = path.split('.');

    if (section !== 'state' && section !== 'output') {
      throw new Error(`Cannot write to ${section} - only 'state' and 'output' are writable`);
    }

    const tableName = `context_${section}`;
    const schema = section === 'state' ? this.contextSchema : this.outputSchema;

    // Simple implementation: clear table and insert new value
    // Future: support JSONPath for nested updates
    if (typeof value === 'object' && value !== null && schema) {
      this.executor.replace(schema, tableName, value as Record<string, unknown>);
    } else {
      this.executor.deleteAll(tableName);
    }

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path,
      value,
    });
  }

  /**
   * Apply node output to context
   * Writes task output to context_output table with schema validation
   */
  async applyNodeOutput(output: Record<string, unknown>): Promise<void> {
    await this.loadSchemas();

    // Lazy-initialize validator
    if (!this.outputValidator) {
      this.outputValidator = new Validator(this.outputSchema!, this.customTypes);
    }

    const result = this.outputValidator.validate(output);

    this.emitter.emitTrace({
      type: 'operation.context.validate',
      path: 'output',
      schema_type: this.outputSchema!.type || 'unknown',
      valid: result.valid,
      error_count: result.errors.length,
      errors: result.errors.slice(0, 5).map((e) => e.message),
    });

    if (!result.valid) {
      throw new Error(
        `Output validation failed: ${result.errors.map((e) => e.message).join(', ')}`,
      );
    }

    // Replace existing output with new
    this.executor.replace(this.outputSchema!, 'context_output', output);

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path: 'output',
      value: output,
    });
  }

  /**
   * Get read-only snapshot of entire context for decision logic
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
}
