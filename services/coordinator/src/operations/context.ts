/**
 * Schema-driven SQL operations for workflow context and branch storage.
 * See docs/architecture/branch-storage.md for design details.
 */

import type { Emitter } from '@wonder/events';
import { Schema, type JSONSchema, type SchemaTable, type SqlHook } from '@wonder/schemas';

import {
  extractFromTaskOutput,
  getNestedValue,
  parsePath,
  setNestedValue,
} from '../shared';
import type { BranchOutput, ContextSnapshot, MergeConfig } from '../types';
import type { DefinitionManager } from './defs';

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
 *   2. Node's outputMapping transforms task output to context paths
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

  constructor(sql: SqlStorage, defs: DefinitionManager, emitter: Emitter) {
    this.sql = sql;
    this.defs = defs;
    this.emitter = emitter;

    // Create SQL hook for tracing
    this.sqlHook = {
      onQuery: (query, params, durationMs) => {
        this.emitter.emitTrace({
          type: 'sql.query',
          durationMs: durationMs,
          payload: {
            sql: query,
            params,
          },
        });
      },
    };
  }

  /** Initialize context tables and store input. */
  initialize(input: Record<string, unknown>): void {
    const workflowDef = this.defs.getWorkflowDef();

    const inputSchema = new Schema(workflowDef.inputSchema as JSONSchema);
    const outputSchema = new Schema(workflowDef.outputSchema as JSONSchema);

    this.inputTable = inputSchema.bind(this.sql, 'context_input', this.sqlHook);
    this.outputTable = outputSchema.bind(this.sql, 'context_output', this.sqlHook);

    if (workflowDef.contextSchema) {
      const stateSchema = new Schema(workflowDef.contextSchema as JSONSchema);
      this.stateTable = stateSchema.bind(this.sql, 'context_state', this.sqlHook);
    }

    const tablesCreated: string[] = [];

    // Create tables
    this.inputTable!.create();
    tablesCreated.push('context_input');

    if (this.stateTable) {
      this.stateTable.create();
      // Initialize with empty row so setField() can update it later
      this.stateTable.insert({});
      tablesCreated.push('context_state');
    }

    this.outputTable!.create();
    // Initialize with empty row so setField() can update it later
    this.outputTable!.insert({});
    tablesCreated.push('context_output');

    this.emitter.emitTrace({
      type: 'operation.context.initialized',
      payload: {
        hasInputSchema: true,
        hasContextSchema: this.stateTable !== null,
        tableCount: tablesCreated.length,
        tablesCreated: tablesCreated,
      },
    });

    // Validate and store input
    const result = this.inputTable!.validate(input);

    this.emitter.emitTrace({
      type: 'operation.context.validate',
      payload: {
        path: 'input',
        schemaType: 'object',
        valid: result.valid,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 5).map((e) => e.message),
      },
    });

    if (!result.valid) {
      throw new Error(`Input validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    this.inputTable!.insert(input);

    this.emitter.emitTrace({
      type: 'operation.context.section_replaced',
      payload: {
        section: 'input',
        data: input,
      },
    });
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /** Read entire section from context. */
  getSection(section: string): Record<string, unknown> {
    const table = this.getTable(section);
    const value = (table?.selectFirst() as Record<string, unknown>) ?? {};

    this.emitter.emitTrace({
      type: 'operation.context.read',
      payload: {
        path: section,
        value,
      },
    });

    return value;
  }

  /** Read value from context (supports nested paths). */
  get(path: string): unknown {
    const { section, fieldParts } = parsePath(path);
    const sectionData = this.getSection(section);

    if (fieldParts.length === 0) {
      return sectionData;
    }

    return getNestedValue(sectionData, fieldParts.join('.'));
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /** Replace an entire section with new data. */
  replaceSection(section: string, data: Record<string, unknown>): void {
    const table = this.getTable(section);
    if (!table) {
      throw new Error(`No table for section '${section}' - context_schema may be missing`);
    }

    table.replace(data);

    this.emitter.emitTrace({
      type: 'operation.context.section_replaced',
      payload: {
        section,
        data,
      },
    });
  }

  /** Set a field within a section (read-modify-write). */
  setField(path: string, value: unknown): void {
    const { section, fieldParts } = parsePath(path);
    const table = this.getTable(section);
    if (!table) {
      throw new Error(`No table for section '${section}' - context_schema may be missing`);
    }

    // Read current section, update nested field, write back
    const currentData = this.getSection(section);
    const updatedData = setNestedValue(currentData, fieldParts, value);
    table.replace(updatedData);

    this.emitter.emitTrace({
      type: 'operation.context.field_set',
      payload: {
        path,
        value,
      },
    });
  }

  /**
   * Get read-only snapshot of entire context.
   *
   * Returns input, state, and output from schema-driven tables.
   * Branch outputs are stored separately and merged into state/output
   * via mergeBranches() at fan-in points.
   */
  getSnapshot(): ContextSnapshot {
    const snapshot = {
      input: this.getSection('input'),
      state: this.getSection('state'),
      output: this.getSection('output'),
    };

    this.emitter.emitTrace({
      type: 'operation.context.snapshot',
      payload: { snapshot },
    });

    return snapshot;
  }

  // ============================================================================
  // Output Mapping (for linear execution)
  // ============================================================================

  /**
   * Apply node's outputMapping to write task output to context.
   *
   * For linear flows (no fan-out), task output is written directly to
   * schema-driven context tables via the node's outputMapping.
   *
   * Mappings are JSONPath-style: { "state.result": "$.response", "output.greeting": "$.message" }
   * - Target paths (keys) specify where in context to write (state.* or output.*)
   * - Source paths (values) specify what to extract from task output
   */
  applyOutputMapping(
    outputMapping: Record<string, string> | null,
    taskOutput: Record<string, unknown>,
  ): void {
    // Emit start event with input context
    this.emitter.emitTrace({
      type: 'operation.context.outputMapping.started',
      payload: {
        outputMapping: outputMapping,
        taskOutputKeys: Object.keys(taskOutput),
      },
    });

    if (!outputMapping) {
      this.emitter.emitTrace({
        type: 'operation.context.outputMapping.skipped',
        payload: { reason: 'no_mapping' },
      });
      return;
    }

    for (const [targetPath, sourcePath] of Object.entries(outputMapping)) {
      // Evaluate expression with `result` bound to task output
      const value = extractFromTaskOutput(sourcePath, taskOutput);

      // Use setField for the write (handles path parsing and read-modify-write)
      this.setField(targetPath, value);

      this.emitter.emitTrace({
        type: 'operation.context.outputMapping.applied',
        payload: {
          targetPath: targetPath,
          sourcePath: sourcePath,
          extractedValue: value,
        },
      });
    }
  }

  /** Get table by path. */
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

  /** Create a branch output table for a token. */
  initializeBranchTable(tokenId: string, outputSchema: JSONSchema): void {
    const tableName = `branch_output_${tokenId}`;
    const schema = new Schema(outputSchema);
    const table = schema.bind(this.sql, tableName, this.sqlHook);

    table.create();
    this.branchTables.set(tokenId, table);

    this.emitter.emitTrace({
      type: 'operation.context.branch_table.created',
      tokenId: tokenId,
      payload: {
        tableName: tableName,
        schemaType: outputSchema.type as string,
      },
    });
  }

  /** Write task output to a token's branch table. */
  applyBranchOutput(tokenId: string, output: Record<string, unknown>): void {
    const table = this.branchTables.get(tokenId);

    if (!table) {
      throw new Error(`Branch table not found for token ${tokenId}`);
    }

    const result = table.validate(output);

    this.emitter.emitTrace({
      type: 'operation.context.branch.validate',
      tokenId: tokenId,
      payload: {
        valid: result.valid,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 5).map((e) => e.message),
      },
    });

    if (!result.valid) {
      throw new Error(
        `Branch output validation failed: ${result.errors.map((e) => e.message).join(', ')}`,
      );
    }

    table.insert(output);

    this.emitter.emitTrace({
      type: 'operation.context.branch.written',
      tokenId: tokenId,
      payload: { output },
    });
  }

  /** Read outputs from sibling branch tables. */
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

      this.emitter.emitTrace({
        type: 'operation.context.branch.read',
        tokenId: tokenId,
        payload: {
          branchIndex: branchIndex,
          output,
          fromCache: this.branchTables.has(tokenId),
        },
      });

      outputs.push({
        tokenId,
        branchIndex,
        output,
      });
    }

    this.emitter.emitTrace({
      type: 'operation.context.branches_read',
      payload: {
        tokenIds: tokenIds,
        outputCount: outputs.length,
      },
    });

    return outputs;
  }

  /** Merge branch outputs into main context. */
  mergeBranches(branchOutputs: BranchOutput[], merge: MergeConfig): void {
    this.emitter.emitTrace({
      type: 'operation.context.merge.started',
      payload: {
        siblingCount: branchOutputs.length,
        strategy: merge.strategy,
        sourcePath: merge.source,
        targetPath: merge.target,
      },
    });

    // Extract outputs based on source path
    const extractedOutputs = branchOutputs.map((b) => {
      if (merge.source === '_branch.output') {
        return b;
      }
      // Extract nested path from output (e.g., '_branch.output.ideas')
      // For a source like '_branch.output.ideas', we want to extract just the 'ideas' value
      const path = merge.source.replace('_branch.output.', '');
      const extractedValue = getNestedValue(b.output, path);
      return {
        ...b,
        output: extractedValue,
      };
    });

    // Apply merge strategy
    let merged: unknown;

    switch (merge.strategy) {
      case 'append': {
        // Collect all outputs into array, ordered by branch index
        // If outputs are arrays, flatten them (e.g., merging [ideas1, ideas2, ideas3])
        const sortedForAppend = extractedOutputs.sort((a, b) => a.branchIndex - b.branchIndex);
        const outputs = sortedForAppend.map((b) => b.output);
        // Flatten if all outputs are arrays
        if (outputs.every((o) => Array.isArray(o))) {
          merged = outputs.flat();
        } else {
          merged = outputs;
        }
        break;
      }

      case 'collect': {
        // Collect all outputs into array, preserving structure (no flattening)
        // Use this when you want [[a,b], [c,d]] instead of [a,b,c,d]
        const sortedForCollect = extractedOutputs.sort((a, b) => a.branchIndex - b.branchIndex);
        merged = sortedForCollect.map((b) => b.output);
        break;
      }

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

      case 'last_wins': {
        // Take last completed (highest branch index)
        const sortedForLastWins = extractedOutputs.sort((a, b) => b.branchIndex - a.branchIndex);
        merged = sortedForLastWins[0]?.output ?? {};
        break;
      }
    }

    // Write to target path in context (setField handles nested paths)
    this.setField(merge.target, merged);

    this.emitter.emitTrace({
      type: 'operation.context.merged',
      payload: {
        targetPath: merge.target,
        branchCount: branchOutputs.length,
      },
    });
  }

  /** Drop branch tables after merge (cleanup). */
  dropBranchTables(tokenIds: string[]): void {
    for (const tokenId of tokenIds) {
      const table = this.branchTables.get(tokenId);

      if (table) {
        // Drop all tables (including array tables) in dependency order
        table.dropAll();
      }

      // Remove from cache
      this.branchTables.delete(tokenId);
    }

    this.emitter.emitTrace({
      type: 'operation.context.branch_table.dropped',
      payload: {
        tokenIds: tokenIds,
        tablesDropped: tokenIds.length,
      },
    });
  }

}
