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

// TODO: Implement context operations using @wonder/context
