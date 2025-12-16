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
 *   - applyOutputMapping(mapping, taskOutput) - Write task output via node's output_mapping
 *
 * Branch storage operations (for parallel execution):
 *   - initializeBranchTable(tokenId, schema) - Create branch_output_{tokenId} table
 *   - applyBranchOutput(tokenId, output) - Write task output to branch table
 *   - getBranchOutputs(tokenIds) - Read outputs from sibling branch tables
 *   - mergeBranches(siblings, merge) - Merge branch outputs into main context
 *   - dropBranchTables(tokenIds) - Cleanup branch tables after merge
 *
 * Data flow design:
 *
 * Linear flows (no fan-out):
 *   - Node.output_mapping specifies where to write task output in context
 *   - e.g., { "state.result": "$.greeting" } writes task output.greeting to context.state.result
 *   - Uses applyOutputMapping() to transform and store
 *
 * Fan-out flows (parallel branches):
 *   - Each branch token gets isolated tables: branch_output_{tokenId}
 *   - Task outputs written via applyBranchOutput()
 *   - At fan-in: mergeBranches() combines outputs into context using Transition.synchronization.merge
 *   - Branch tables dropped after merge
 *
 * See docs/architecture/branch-storage.md for complete design.
 */

import type { Emitter } from '@wonder/events';
import { Schema, type JSONSchema, type SchemaTable, type SqlHook } from '@wonder/schemas';
import { composeSqlMessage } from '../helpers/sql.js';
import type { ContextSnapshot } from '../types';
import type { DefinitionManager } from './defs';

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

/** Output mapping entry: maps task output field to context path */
export type OutputMappingEntry = {
  targetPath: string; // e.g., "state.result" or "output.greeting"
  value: unknown;
};

/**
 * ContextManager manages runtime state for a workflow execution.
 *
 * Uses Schema from @wonder/context for validation and SQL generation,
 * with SchemaTable for bound execution against context tables.
 *
 * Data flow for linear execution (no fan-out):
 *   1. Task completes with output
 *   2. Node's output_mapping transforms task output to context paths
 *   3. applyOutputMapping() writes directly to schema-driven state/output tables
 *
 * Data flow for parallel execution (fan-out):
 *   1. initializeBranchTable() creates isolated branch_output_{tokenId} table
 *   2. Task completes, applyBranchOutput() writes to branch table
 *   3. At fan-in, mergeBranches() reads siblings and writes to main context
 *   4. dropBranchTables() cleans up
 */
export class ContextManager {
  private readonly sql: SqlStorage;
  private readonly defs: DefinitionManager;
  private readonly emitter: Emitter;
  private readonly sqlHook: SqlHook;

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

    // Create SQL hook for tracing
    this.sqlHook = {
      onQuery: (query, params, durationMs) => {
        this.emitter.emitTrace({
          type: 'sql.query',
          message: composeSqlMessage(query, durationMs),
          sql: query,
          params,
          duration_ms: durationMs,
        });
      },
    };
  }

  /**
   * Load schemas and bind tables (lazy initialization)
   */
  private loadSchemas(): void {
    if (this.initialized) return;

    const workflowDef = this.defs.getWorkflowDef();

    const inputSchema = new Schema(workflowDef.input_schema as JSONSchema);
    const outputSchema = new Schema(workflowDef.output_schema as JSONSchema);

    this.inputTable = inputSchema.bind(this.sql, 'context_input', this.sqlHook);
    this.outputTable = outputSchema.bind(this.sql, 'context_output', this.sqlHook);

    if (workflowDef.context_schema) {
      const stateSchema = new Schema(workflowDef.context_schema as JSONSchema);
      this.stateTable = stateSchema.bind(this.sql, 'context_state', this.sqlHook);
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
      type: 'operation.context.replace_section',
      section: 'input',
      data: input,
    });
  }

  // ============================================================================
  // Path Parsing (pure utilities)
  // ============================================================================

  /**
   * Parse a dot-notation path into section and field parts
   * e.g., "state.all_trivia.items" → { section: "state", fieldParts: ["all_trivia", "items"] }
   */
  private parsePath(path: string): { section: string; fieldParts: string[] } {
    const [section, ...fieldParts] = path.split('.');
    return { section, fieldParts };
  }

  /**
   * Validate that a section is writable
   */
  private assertWritableSection(section: string): void {
    if (section !== 'state' && section !== 'output') {
      throw new Error(`Cannot write to '${section}' - only 'state' and 'output' are writable`);
    }
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Read entire section from context
   */
  getSection(section: string): Record<string, unknown> {
    this.loadSchemas();

    const table = this.getTable(section);
    const value = (table?.selectFirst() as Record<string, unknown>) ?? {};

    this.emitter.emitTrace({
      type: 'operation.context.read',
      path: section,
      value,
    });

    return value;
  }

  /**
   * Read value from context (supports nested paths for backwards compat)
   */
  get(path: string): unknown {
    const { section, fieldParts } = this.parsePath(path);
    const sectionData = this.getSection(section);

    if (fieldParts.length === 0) {
      return sectionData;
    }

    return this.getNestedValue(sectionData, fieldParts.join('.'));
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Replace an entire section with new data
   * Use when you have the complete object to store (e.g., after merge)
   */
  replaceSection(section: string, data: Record<string, unknown>): void {
    this.loadSchemas();
    this.assertWritableSection(section);

    const table = this.getTable(section);
    if (!table) {
      throw new Error(`No table for section '${section}' - context_schema may be missing`);
    }

    table.replace(data);

    this.emitter.emitTrace({
      type: 'operation.context.replace_section',
      section,
      data,
    });
  }

  /**
   * Set a field within a section (read-modify-write)
   * Use for nested paths like "state.all_trivia" or "output.result"
   */
  setField(path: string, value: unknown): void {
    this.loadSchemas();

    const { section, fieldParts } = this.parsePath(path);
    this.assertWritableSection(section);

    const table = this.getTable(section);
    if (!table) {
      throw new Error(`No table for section '${section}' - context_schema may be missing`);
    }

    // Read current section, update nested field, write back
    const currentData = this.getSection(section);
    const updatedData = this.setNestedValue(currentData, fieldParts, value);
    table.replace(updatedData);

    this.emitter.emitTrace({
      type: 'operation.context.set_field',
      path,
      value,
    });
  }

  /**
   * Get read-only snapshot of entire context
   *
   * Returns input, state, and output from schema-driven tables.
   * Branch outputs are stored separately and merged into state/output
   * via mergeBranches() at fan-in points.
   */
  getSnapshot(): ContextSnapshot {
    this.loadSchemas();

    const snapshot = {
      input: this.getSection('input'),
      state: this.getSection('state'),
      output: this.getSection('output'),
    };

    this.emitter.emitTrace({
      type: 'operation.context.snapshot',
      snapshot,
    });

    return snapshot;
  }

  // ============================================================================
  // Output Mapping (for linear execution)
  // ============================================================================

  /**
   * Apply node's output_mapping to write task output to context
   *
   * For linear flows (no fan-out), task output is written directly to
   * schema-driven context tables via the node's output_mapping.
   *
   * Mappings are JSONPath-style: { "state.result": "$.response", "output.greeting": "$.message" }
   * - Target paths (keys) specify where in context to write (state.* or output.*)
   * - Source paths (values) specify what to extract from task output
   *
   * @param outputMapping - Node's output_mapping (target -> source JSONPath)
   * @param taskOutput - Raw task output from executor
   */
  applyOutputMapping(
    outputMapping: Record<string, string> | null,
    taskOutput: Record<string, unknown>,
  ): void {
    this.loadSchemas();

    // Emit start event with input context
    this.emitter.emitTrace({
      type: 'operation.context.output_mapping.start',
      output_mapping: outputMapping,
      task_output_keys: Object.keys(taskOutput),
    });

    if (!outputMapping) {
      this.emitter.emitTrace({
        type: 'operation.context.output_mapping.skip',
        reason: 'no_mapping',
      });
      return;
    }

    for (const [targetPath, sourcePath] of Object.entries(outputMapping)) {
      // Extract value from task output using source path
      const value = this.extractValue(taskOutput, sourcePath);

      // Use setField for the write (handles path parsing and read-modify-write)
      this.setField(targetPath, value);

      this.emitter.emitTrace({
        type: 'operation.context.output_mapping.apply',
        target_path: targetPath,
        source_path: sourcePath,
        extracted_value: value,
      });
    }
  }

  /**
   * Extract value from object using JSONPath-style path
   * e.g., "$.response.greeting" extracts obj.response.greeting
   */
  private extractValue(obj: Record<string, unknown>, path: string): unknown {
    // Handle literal values (not starting with $.)
    if (!path.startsWith('$.')) {
      return path;
    }

    const pathParts = path.slice(2).split('.'); // Remove '$.' prefix
    let value: unknown = obj;

    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set nested value in object by path parts
   * e.g., setNestedValue({}, ['result', 'data'], 'hello') -> { result: { data: 'hello' } }
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    pathParts: string[],
    value: unknown,
  ): Record<string, unknown> {
    if (pathParts.length === 0) {
      // No path parts means replace entire object
      return value as Record<string, unknown>;
    }

    const result = { ...obj };
    let current = result;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      } else {
        current[part] = { ...(current[part] as Record<string, unknown>) };
      }
      current = current[part] as Record<string, unknown>;
    }

    current[pathParts[pathParts.length - 1]] = value;
    return result;
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
    const table = schema.bind(this.sql, tableName, this.sqlHook);

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
        table = schema.bind(this.sql, tableName, this.sqlHook);
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
    this.emitter.emitTrace({
      type: 'operation.context.merge.start',
      sibling_count: branchOutputs.length,
      strategy: merge.strategy,
      source_path: merge.source,
      target_path: merge.target,
    });

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

    // Write to target path in context (setField handles nested paths)
    this.setField(merge.target, merged);

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
