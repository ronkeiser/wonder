/**
 * Schema Executor - SQL execution for schema-driven tables
 *
 * Combines DDLGenerator and DMLGenerator with SqlStorage to provide
 * a complete schema-to-SQL interface for Cloudflare Workers DOs.
 */

import type { CustomTypeRegistry } from './custom-types.js';
import { DDLGenerator, type DDLGeneratorOptions } from './ddl-generator.js';
import { DMLGenerator, type DMLGeneratorOptions } from './dml-generator.js';
import type { JSONSchema } from './types.js';

export type ExecutorOptions = DDLGeneratorOptions & DMLGeneratorOptions;

/**
 * Minimal interface for SqlStorage-compatible execution.
 * Matches Cloudflare Workers SqlStorage.exec() signature.
 */
export interface SqlExecutor {
  exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>>;
}

/**
 * SchemaExecutor handles SQL execution for schema-driven tables.
 *
 * Wraps DDL/DML generators with SqlStorage to provide a clean API
 * for table lifecycle management and data operations.
 */
export class SchemaExecutor {
  private readonly sql: SqlExecutor;
  private readonly customTypes: CustomTypeRegistry;
  private readonly options: ExecutorOptions;

  constructor(sql: SqlExecutor, customTypes: CustomTypeRegistry, options: ExecutorOptions = {}) {
    this.sql = sql;
    this.customTypes = customTypes;
    this.options = options;
  }

  /**
   * Create a table from JSON Schema
   */
  createTable(schema: JSONSchema, tableName: string): void {
    const ddlGen = new DDLGenerator(schema, this.customTypes, this.options);
    const ddl = ddlGen.generateDDL(tableName);
    this.sql.exec(ddl);
  }

  /**
   * Drop a table if it exists
   */
  dropTable(tableName: string): void {
    this.sql.exec(`DROP TABLE IF EXISTS ${tableName};`);
  }

  /**
   * Insert data into a table using schema-driven DML
   */
  insert(schema: JSONSchema, tableName: string, data: Record<string, unknown>): void {
    const dmlGen = new DMLGenerator(schema, this.customTypes, this.options);
    const { statements, values } = dmlGen.generateInsert(tableName, data);

    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]);
    }
  }

  /**
   * Delete all rows from a table
   */
  deleteAll(tableName: string): void {
    this.sql.exec(`DELETE FROM ${tableName};`);
  }

  /**
   * Select first row from a table
   */
  selectFirst<T = Record<string, unknown>>(tableName: string): T | null {
    try {
      const result = this.sql.exec(`SELECT * FROM ${tableName} LIMIT 1;`);
      const rows = [...result];
      return rows.length > 0 ? (rows[0] as T) : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a table exists
   */
  tableExists(tableName: string): boolean {
    try {
      const result = this.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
        tableName,
      );
      return [...result].length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Replace data in a table (delete all + insert)
   */
  replace(schema: JSONSchema, tableName: string, data: Record<string, unknown>): void {
    this.deleteAll(tableName);
    this.insert(schema, tableName, data);
  }
}
