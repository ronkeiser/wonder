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
 *   - initializeTable(sql, schema) - Create main context tables from workflow schema
 *   - get(sql, path) - Read value from main context
 *   - set(sql, path, value) - Write value to main context
 *   - getSnapshot(sql) - Read-only view for decision logic
 *
 * Branch storage operations (extensions for parallel execution):
 *   - initializeBranchTable(sql, tokenId, schema) - Create branch_output_{tokenId} tables
 *   - applyNodeOutput(sql, tokenId, output, schema) - Write task output to branch table
 *   - getBranchOutputs(sql, tokenIds, schema) - Read outputs from sibling branch tables
 *   - mergeBranches(sql, siblings, merge, schema) - Merge branch outputs into main context
 *   - dropBranchTables(sql, tokenIds) - Cleanup branch tables after merge
 *
 * Internal helpers:
 *   - applyMergeStrategy(branchData, strategy) - Apply merge strategy (append/merge_object/keyed_by_branch/last_wins)
 *   - readBranchTable(sql, tableName, schema) - Read and reconstruct data from branch table
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

// Create empty custom type registry
const customTypes = new CustomTypeRegistry();

/**
 * Initialize main context tables from workflow schemas
 */
export function initializeTable(
  sql: SqlStorage,
  inputSchema: JSONSchema,
  contextSchema: JSONSchema | undefined,
  emitter: Emitter,
): void {
  let tableCount = 0;

  // Create input table
  if (inputSchema.type === 'object') {
    const ddlGen = new DDLGenerator(inputSchema, customTypes);
    const ddl = ddlGen.generateDDL('context_input');
    sql.exec(ddl);
    tableCount++;
  }

  // Create state table if context schema provided
  if (contextSchema?.type === 'object') {
    const ddlGen = new DDLGenerator(contextSchema, customTypes);
    const ddl = ddlGen.generateDDL('context_state');
    sql.exec(ddl);
    tableCount++;
  }

  // Create output table (initially empty, populated at completion)
  sql.exec(`
    CREATE TABLE IF NOT EXISTS context_output (
      id INTEGER PRIMARY KEY AUTOINCREMENT
    );
  `);
  tableCount++;

  emitter.emitTrace({
    type: 'operation.context.initialize',
    table_count: tableCount,
  });
}

/**
 * Initialize context with validated input data
 */
export function initializeWithInput(
  sql: SqlStorage,
  input: Record<string, unknown>,
  inputSchema: JSONSchema,
  emitter: Emitter,
): void {
  // Validate input against schema
  const validator = new Validator(inputSchema, customTypes);
  const result = validator.validate(input);

  if (!result.valid) {
    throw new Error(`Input validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  // Generate and execute INSERT
  const dmlGen = new DMLGenerator(inputSchema, customTypes);
  const { statements, values } = dmlGen.generateInsert('context_input', input);

  for (let i = 0; i < statements.length; i++) {
    sql.exec(statements[i], values[i]);
  }

  emitter.emitTrace({
    type: 'operation.context.write',
    path: 'input',
    value: input,
  });
}

/**
 * Read value from context at JSONPath
 * Simplified for Chunk 1 - only supports reading entire context sections
 */
export function get(sql: SqlStorage, path: string): unknown {
  // For now, only support reading 'input', 'state', 'output'
  const tableName = `context_${path}`;

  try {
    const result = sql.exec(`SELECT * FROM ${tableName} LIMIT 1;`);
    const rows = [...result];

    if (rows.length === 0) {
      return {};
    }

    // Return first row (we only have one row per context table in simple case)
    return rows[0];
  } catch (error) {
    // Table might not exist (e.g., context_state when no context_schema defined)
    return {};
  }
}

/**
 * Get read-only snapshot of entire context for decision logic
 */
export function getSnapshot(sql: SqlStorage): ContextSnapshot {
  return {
    input: (get(sql, 'input') as Record<string, unknown>) || {},
    state: (get(sql, 'state') as Record<string, unknown>) || {},
    output: (get(sql, 'output') as Record<string, unknown>) || {},
  };
}
