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
import { CustomTypeRegistry, DDLGenerator, DMLGenerator, Validator } from '@wonder/context';
import type { Emitter } from '@wonder/events';
import type { ContextSnapshot } from '../types.js';
import type { MetadataManager } from './metadata.js';

/**
 * ContextManager manages runtime state for a workflow execution.
 *
 * Encapsulates schema-driven SQL operations with caching for validators
 * and generators. Schemas are loaded from metadata table on-demand.
 */
export class ContextManager {
  private readonly sql: SqlStorage;
  private readonly metadata: MetadataManager;
  private readonly emitter: Emitter;
  private readonly customTypes: CustomTypeRegistry;

  // Cached schemas loaded from metadata
  private inputSchema: JSONSchema | null = null;
  private contextSchema: JSONSchema | null = null;
  private outputSchema: JSONSchema | null = null;

  // Cached validators and generators
  private inputValidator: Validator | null = null;
  private contextValidator: Validator | null = null;
  private inputDMLGenerator: DMLGenerator | null = null;
  private contextDMLGenerator: DMLGenerator | null = null;

  constructor(sql: SqlStorage, metadata: MetadataManager, emitter: Emitter) {
    this.sql = sql;
    this.metadata = metadata;
    this.emitter = emitter;
    this.customTypes = new CustomTypeRegistry();
  }

  /**
   * Load schemas from metadata table (lazy initialization)
   */
  private async loadSchemas(): Promise<void> {
    if (this.inputSchema !== null) {
      // Already loaded
      return;
    }

    const workflowDef = await this.metadata.getWorkflowDef();

    this.inputSchema = workflowDef.input_schema;
    this.contextSchema = workflowDef.context_schema ?? null;
    this.outputSchema = workflowDef.output_schema;
  }

  /**
   * Initialize main context tables from workflow schemas
   */
  async initialize(): Promise<void> {
    await this.loadSchemas();

    let tableCount = 0;
    const tablesCreated: string[] = [];

    // Drop existing tables to ensure clean schema
    this.sql.exec('DROP TABLE IF EXISTS context_input');
    this.sql.exec('DROP TABLE IF EXISTS context_state');
    this.sql.exec('DROP TABLE IF EXISTS context_output');

    // Create input table
    if (this.inputSchema!.type === 'object') {
      const ddlGen = new DDLGenerator(this.inputSchema!, this.customTypes);
      const ddl = ddlGen.generateDDL('context_input');
      this.sql.exec(ddl);
      tableCount++;
      tablesCreated.push('context_input');
    }

    // Create state table if context schema provided
    if (this.contextSchema?.type === 'object') {
      const ddlGen = new DDLGenerator(this.contextSchema, this.customTypes);
      const ddl = ddlGen.generateDDL('context_state');
      this.sql.exec(ddl);
      tableCount++;
      tablesCreated.push('context_state');
    }

    // Create output table from output schema
    if (this.outputSchema!.type === 'object') {
      const ddlGen = new DDLGenerator(this.outputSchema!, this.customTypes);
      const ddl = ddlGen.generateDDL('context_output');
      this.sql.exec(ddl);
      tableCount++;
      tablesCreated.push('context_output');
    }

    this.emitter.emitTrace({
      type: 'operation.context.initialize',
      has_input_schema: this.inputSchema!.type === 'object',
      has_context_schema: this.contextSchema?.type === 'object',
      table_count: tableCount,
      tables_created: tablesCreated,
    });
  }

  /**
   * Initialize context with validated input data
   */
  async initializeWithInput(input: Record<string, unknown>): Promise<void> {
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

    // Lazy-initialize DML generator
    if (!this.inputDMLGenerator) {
      this.inputDMLGenerator = new DMLGenerator(this.inputSchema!, this.customTypes);
    }

    const { statements, values } = this.inputDMLGenerator.generateInsert('context_input', input);

    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]);
    }

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path: 'input',
      value: input,
    });
  }

  /**
   * Read value from context at JSONPath
   * Simplified for Chunk 2 - only supports reading entire context sections
   */
  get(path: string): unknown {
    // For now, only support reading 'input', 'state', 'output'
    const tableName = `context_${path}`;

    try {
      const result = this.sql.exec(`SELECT * FROM ${tableName} LIMIT 1;`);
      const rows = [...result];

      if (rows.length === 0) {
        this.emitter.emitTrace({
          type: 'operation.context.read',
          path,
          value: {},
        });
        return {};
      }

      // Return first row (we only have one row per context table in simple case)
      const value = rows[0];
      this.emitter.emitTrace({
        type: 'operation.context.read',
        path,
        value,
      });
      return value;
    } catch (error) {
      // Table might not exist (e.g., context_state when no context_schema defined)
      this.emitter.emitTrace({
        type: 'operation.context.read',
        path,
        value: {},
      });
      return {};
    }
  }

  /**
   * Write value to context at JSONPath
   * Simplified for Chunk 2 - supports setting scalar values and objects
   */
  set(path: string, value: unknown): void {
    // For now, only support writing to 'state' or 'output'
    const [section, ...rest] = path.split('.');

    if (section !== 'state' && section !== 'output') {
      throw new Error(`Cannot write to ${section} - only 'state' and 'output' are writable`);
    }

    const tableName = `context_${section}`;

    // Simple implementation: clear table and insert new value
    // Future: support JSONPath for nested updates
    this.sql.exec(`DELETE FROM ${tableName};`);

    if (typeof value === 'object' && value !== null) {
      // For now, insert as single row with flattened columns
      const obj = value as Record<string, unknown>;
      const columns = Object.keys(obj);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(obj);

      this.sql.exec(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`,
        values,
      );
    }

    this.emitter.emitTrace({
      type: 'operation.context.write',
      path,
      value,
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
