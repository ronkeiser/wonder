/**
 * Schema - Primary API for @wonder/schemas
 *
 * Unified entry point that wraps JSONSchema and provides:
 * - Validation (cached Validator)
 * - DDL generation (cached DDLGenerator)
 * - DML generation (cached DMLGenerator)
 * - Table binding for execution
 */

import { CustomTypeRegistry } from './custom-types.js';
import { DDLGenerator, type DDLGeneratorOptions } from './generators/ddl-generator.js';
import {
  DMLGenerator,
  type DMLGeneratorOptions,
  type InsertResult,
} from './generators/dml-generator.js';
import { SelectGenerator, type SelectGeneratorOptions } from './generators/select-generator.js';
import type { JSONSchema, ValidationResult, ValidatorOptions } from './types.js';
import { Validator } from './validation/validator.js';

export type SchemaOptions = DDLGeneratorOptions &
  DMLGeneratorOptions &
  SelectGeneratorOptions &
  ValidatorOptions;

/**
 * Minimal interface for SqlStorage-compatible execution.
 */
export interface SqlExecutor {
  exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>>;
}

/**
 * Hook for observing SQL execution (tracing, logging, metrics)
 */
export interface SqlHook {
  onQuery?: (query: string, params: unknown[], durationMs: number) => void;
}

/**
 * Wraps a SqlExecutor with optional hooks for observability
 */
function wrapSqlExecutor(sql: SqlExecutor, hooks?: SqlHook): SqlExecutor {
  if (!hooks?.onQuery) {
    return sql;
  }

  return {
    exec(query: string, ...args: unknown[]): Iterable<Record<string, unknown>> {
      const start = performance.now();
      const result = sql.exec(query, ...args);
      const duration = performance.now() - start;
      hooks.onQuery!(query, args, duration);
      return result;
    },
  };
}

/**
 * Schema wraps a JSONSchema and provides cached access to validation and SQL generation.
 */
export class Schema {
  private readonly json: JSONSchema;
  private readonly registry: CustomTypeRegistry;
  private readonly options: SchemaOptions;

  /** Cached instances */
  private _validator: Validator | null = null;
  private _ddlGenerator: DDLGenerator | null = null;
  private _dmlGenerator: DMLGenerator | null = null;
  private _selectGenerator: SelectGenerator | null = null;

  constructor(json: JSONSchema, registry?: CustomTypeRegistry, options: SchemaOptions = {}) {
    this.json = json;
    this.registry = registry ?? new CustomTypeRegistry();
    this.options = options;
  }

  /** Access the raw JSON Schema */
  get raw(): JSONSchema {
    return this.json;
  }

  /** Get the JSON schema (alias for raw) */
  getJsonSchema(): JSONSchema {
    return this.json;
  }

  /** Get cached validator */
  private get validator(): Validator {
    if (!this._validator) {
      this._validator = new Validator(this.json, this.registry, this.options);
    }
    return this._validator;
  }

  /** Get cached DDL generator */
  private get ddlGenerator(): DDLGenerator {
    if (!this._ddlGenerator) {
      this._ddlGenerator = new DDLGenerator(this.json, this.registry, this.options);
    }
    return this._ddlGenerator;
  }

  /** Get cached DML generator */
  private get dmlGenerator(): DMLGenerator {
    if (!this._dmlGenerator) {
      this._dmlGenerator = new DMLGenerator(this.json, this.registry, this.options);
    }
    return this._dmlGenerator;
  }

  /** Get cached SELECT generator */
  private get selectGenerator(): SelectGenerator {
    if (!this._selectGenerator) {
      this._selectGenerator = new SelectGenerator(this.json, this.options);
    }
    return this._selectGenerator;
  }

  /**
   * Validate data against this schema
   */
  validate(data: unknown): ValidationResult {
    return this.validator.validate(data);
  }

  /**
   * Generate CREATE TABLE DDL
   */
  generateDDL(tableName: string): string {
    return this.ddlGenerator.generateDDL(tableName);
  }

  /**
   * Generate INSERT statements with bound values
   */
  generateInsert(tableName: string, data: Record<string, unknown>): InsertResult {
    return this.dmlGenerator.generateInsert(tableName, data);
  }

  /**
   * Generate DELETE ALL statements (handles cascade for array tables)
   */
  generateDeleteAll(tableName: string): string[] {
    return this.dmlGenerator.generateDelete(tableName, '1=1');
  }

  /**
   * Generate DROP TABLE statements in reverse dependency order
   * (children first, then parent) to respect FK constraints
   */
  generateDropAll(tableName: string): string[] {
    const tableNames = this.ddlGenerator.getTableNames(tableName);
    // Reverse order: drop children before parents to avoid FK violations
    return tableNames.reverse().map((name) => `DROP TABLE IF EXISTS ${name};`);
  }

  /**
   * Read first row from table and reconstruct as structured object
   */
  readFirst(sql: SqlExecutor, tableName: string): Record<string, unknown> | null {
    return this.selectGenerator.readFirst(sql, tableName);
  }

  /**
   * Bind this schema to a SQL executor and table name for execution
   * Optionally accepts hooks for SQL observability (tracing, metrics)
   */
  bind(sql: SqlExecutor, tableName: string, hooks?: SqlHook): SchemaTable {
    const wrappedSql = wrapSqlExecutor(sql, hooks);
    return new SchemaTable(this, wrappedSql, tableName);
  }
}

/**
 * SchemaTable - A schema bound to a specific table for execution
 */
export class SchemaTable {
  private readonly inserter: SchemaInserter;

  constructor(
    private readonly schema: Schema,
    private readonly sql: SqlExecutor,
    private readonly tableName: string,
  ) {
    this.inserter = new SchemaInserter(sql);
  }

  /** Get the underlying JSON schema */
  getSchema(): JSONSchema {
    return this.schema.getJsonSchema();
  }

  /** Validate data against the schema */
  validate(data: unknown): ValidationResult {
    return this.schema.validate(data);
  }

  /** Create the table (DROP IF EXISTS + CREATE) */
  create(): void {
    this.drop();
    this.sql.exec(this.schema.generateDDL(this.tableName));
  }

  /** Drop the table if it exists */
  drop(): void {
    this.sql.exec(`DROP TABLE IF EXISTS ${this.tableName};`);
  }

  /** Drop all tables (parent + array children) in FK-safe order */
  dropAll(): void {
    for (const stmt of this.schema.generateDropAll(this.tableName)) {
      this.sql.exec(stmt);
    }
  }

  /** Insert data with full nested array support */
  insert(data: Record<string, unknown>): void {
    this.inserter.insert(this.tableName, this.getSchema(), data);
  }

  /** Delete all rows (handles cascade for array tables) */
  deleteAll(): void {
    for (const stmt of this.schema.generateDeleteAll(this.tableName)) {
      this.sql.exec(stmt);
    }
  }

  /** Replace all data (delete + insert) */
  replace(data: Record<string, unknown>): void {
    this.deleteAll();
    this.insert(data);
  }

  /** Select the first row (schema-aware reconstruction) */
  selectFirst<T = Record<string, unknown>>(): T | null {
    try {
      return this.schema.readFirst(this.sql, this.tableName) as T | null;
    } catch {
      return null;
    }
  }

  /** Check if the table exists */
  exists(): boolean {
    try {
      const result = this.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
        this.tableName,
      );
      return [...result].length > 0;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// SchemaInserter - Handles recursive insertion of schema-driven data
// ============================================================================

/**
 * Handles inserting data into schema-driven tables with full nested array support.
 * Separated from SchemaTable to keep insertion logic isolated and testable.
 */
class SchemaInserter {
  constructor(private readonly sql: SqlExecutor) {}

  /** Insert data into a table, handling nested objects and arrays recursively */
  insert(tableName: string, schema: JSONSchema, data: Record<string, unknown>): number {
    return this.insertRow(tableName, schema, data, null);
  }

  /** Insert a row and its nested arrays, returning the row ID */
  private insertRow(
    tableName: string,
    schema: JSONSchema,
    data: Record<string, unknown>,
    arrayContext: { fkColumn: string; parentId: number; index: number } | null,
  ): number {
    if (schema.type !== 'object' || !schema.properties) {
      throw new Error('Insert requires an object schema');
    }

    // Build columns/values
    const columns: string[] = [];
    const values: unknown[] = [];

    if (arrayContext) {
      columns.push(arrayContext.fkColumn, '"index"');
      values.push(arrayContext.parentId, arrayContext.index);
    }

    this.collectScalars(schema, data, '', columns, values);

    // Insert and get ID
    const rowId = this.exec(tableName, columns, values);

    // Insert child arrays
    this.insertChildArrays(tableName, schema, data, '', rowId);

    return rowId;
  }

  /** Collect scalar columns, flattening nested objects */
  private collectScalars(
    schema: JSONSchema,
    data: Record<string, unknown>,
    prefix: string,
    columns: string[],
    values: unknown[],
  ): void {
    if (!schema.properties) return;

    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[field];
      if (value === undefined) continue;

      const col = prefix ? `${prefix}_${field}` : field;

      switch (fieldSchema.type) {
        case 'object':
          this.collectScalars(fieldSchema, value as Record<string, unknown>, col, columns, values);
          break;
        case 'array':
          break; // Handled separately
        case 'boolean':
          columns.push(col);
          values.push(value ? 1 : 0);
          break;
        default:
          columns.push(col);
          values.push(value);
      }
    }
  }

  /** Find and insert arrays (including those nested in flattened objects) */
  private insertChildArrays(
    parentTable: string,
    schema: JSONSchema,
    data: Record<string, unknown>,
    prefix: string,
    parentId: number,
  ): void {
    if (!schema.properties) return;

    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[field];
      if (value === undefined) continue;

      const path = prefix ? `${prefix}_${field}` : field;

      if (fieldSchema.type === 'object') {
        this.insertChildArrays(
          parentTable,
          fieldSchema,
          value as Record<string, unknown>,
          path,
          parentId,
        );
      } else if (fieldSchema.type === 'array' && fieldSchema.items && Array.isArray(value)) {
        this.insertArrayItems(parentTable, path, fieldSchema.items, value, parentId);
      }
    }
  }

  /** Insert array items into child table */
  private insertArrayItems(
    parentTable: string,
    fieldPath: string,
    itemSchema: JSONSchema,
    items: unknown[],
    parentId: number,
  ): void {
    const childTable = `${parentTable}_${fieldPath}`;
    const fkColumn = `${parentTable}_id`;

    for (let i = 0; i < items.length; i++) {
      if (itemSchema.type === 'object') {
        this.insertRow(childTable, itemSchema, items[i] as Record<string, unknown>, {
          fkColumn,
          parentId,
          index: i,
        });
      } else {
        this.sql.exec(
          `INSERT INTO ${childTable} (${fkColumn}, "index", value) VALUES (?, ?, ?);`,
          parentId,
          i,
          items[i],
        );
      }
    }
  }

  /** Execute INSERT, return new row ID */
  private exec(table: string, columns: string[], values: unknown[]): number {
    if (columns.length > 0) {
      const placeholders = columns.map(() => '?').join(', ');
      this.sql.exec(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`,
        ...values,
      );
    } else {
      this.sql.exec(`INSERT INTO ${table} DEFAULT VALUES;`);
    }
    const result = [...this.sql.exec('SELECT last_insert_rowid() as id')];
    return result[0]?.id as number;
  }
}
