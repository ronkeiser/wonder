/**
 * Schema - Primary API for @wonder/context
 *
 * Unified entry point that wraps JSONSchema and provides:
 * - Validation (cached Validator)
 * - DDL generation (cached DDLGenerator)
 * - DML generation (cached DMLGenerator)
 * - Table binding for execution
 */

import { CustomTypeRegistry } from './custom-types.js';
import { DDLGenerator, type DDLGeneratorOptions } from './ddl-generator.js';
import { DMLGenerator, type DMLGeneratorOptions, type InsertResult } from './dml-generator.js';
import { SelectGenerator, type SelectGeneratorOptions } from './select-generator.js';
import type { JSONSchema, ValidationResult, ValidatorOptions } from './types.js';
import { Validator } from './validator.js';

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
  constructor(
    private readonly schema: Schema,
    private readonly sql: SqlExecutor,
    private readonly tableName: string,
  ) {}

  /**
   * Get the underlying JSON schema
   */
  getSchema(): JSONSchema {
    return this.schema.getJsonSchema();
  }

  /**
   * Validate data against the schema
   */
  validate(data: unknown): ValidationResult {
    return this.schema.validate(data);
  }

  /**
   * Create the table (DROP IF EXISTS + CREATE)
   */
  create(): void {
    this.drop();
    const ddl = this.schema.generateDDL(this.tableName);
    this.sql.exec(ddl);
  }

  /**
   * Drop the table if it exists
   */
  drop(): void {
    this.sql.exec(`DROP TABLE IF EXISTS ${this.tableName};`);
  }

  /**
   * Drop the table and all its array tables in dependency order
   * (children first, then parent) to respect FK constraints
   */
  dropAll(): void {
    const statements = this.schema.generateDropAll(this.tableName);
    for (const stmt of statements) {
      this.sql.exec(stmt);
    }
  }

  /**
   * Insert data into the table with full recursive array support.
   * Handles nested arrays at any depth.
   */
  insert(data: Record<string, unknown>): void {
    this.insertObject(this.tableName, this.getSchema(), data, null, null);
  }

  /**
   * Insert an object into a table, returning its ID.
   * Handles scalars, flattened nested objects, and arrays recursively.
   */
  private insertObject(
    tableName: string,
    schema: JSONSchema,
    data: Record<string, unknown>,
    parentFkColumn: string | null,
    parentId: number | null,
  ): number {
    if (schema.type !== 'object' || !schema.properties) {
      throw new Error('Insert requires an object schema');
    }

    const columns: string[] = [];
    const values: unknown[] = [];

    // Add FK to parent if this is an array item
    if (parentFkColumn !== null && parentId !== null) {
      columns.push(parentFkColumn, '"index"');
      values.push(parentId, data.__index ?? 0);
    }

    // Collect scalar columns (arrays handled after insert)
    this.collectScalarColumns(schema, data, '', columns, values);

    // Insert row
    const rowId = this.execInsert(tableName, columns, values);

    // Insert arrays (top-level and inside nested objects)
    this.insertArrays(tableName, schema, data, '', rowId);

    return rowId;
  }

  /**
   * Collect scalar columns from an object schema, flattening nested objects.
   */
  private collectScalarColumns(
    schema: JSONSchema,
    data: Record<string, unknown>,
    prefix: string,
    columns: string[],
    values: unknown[],
  ): void {
    if (!schema.properties) return;

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[fieldName];
      if (value === undefined) continue;

      const columnName = prefix ? `${prefix}_${fieldName}` : fieldName;

      switch (fieldSchema.type) {
        case 'object':
          this.collectScalarColumns(
            fieldSchema,
            value as Record<string, unknown>,
            columnName,
            columns,
            values,
          );
          break;
        case 'array':
          // Skip - handled separately
          break;
        case 'boolean':
          columns.push(columnName);
          values.push(value ? 1 : 0);
          break;
        default:
          columns.push(columnName);
          values.push(value);
      }
    }
  }

  /**
   * Insert arrays found in schema, including those nested inside flattened objects.
   */
  private insertArrays(
    parentTableName: string,
    schema: JSONSchema,
    data: Record<string, unknown>,
    prefix: string,
    parentId: number,
  ): void {
    if (!schema.properties) return;

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[fieldName];
      if (value === undefined) continue;

      const pathName = prefix ? `${prefix}_${fieldName}` : fieldName;

      if (fieldSchema.type === 'object') {
        // Recurse into nested objects to find arrays
        this.insertArrays(
          parentTableName,
          fieldSchema,
          value as Record<string, unknown>,
          pathName,
          parentId,
        );
      } else if (fieldSchema.type === 'array' && fieldSchema.items && Array.isArray(value)) {
        this.insertArray(parentTableName, pathName, fieldSchema.items, value, parentId);
      }
    }
  }

  /**
   * Insert an array into its child table.
   */
  private insertArray(
    parentTableName: string,
    arrayFieldPath: string,
    itemSchema: JSONSchema,
    items: unknown[],
    parentId: number,
  ): void {
    const arrayTableName = `${parentTableName}_${arrayFieldPath}`;
    const fkColumn = `${parentTableName}_id`;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (itemSchema.type === 'object') {
        // Object array - recursive insert
        const itemData = { ...(item as Record<string, unknown>), __index: index };
        this.insertObject(arrayTableName, itemSchema, itemData, fkColumn, parentId);
      } else {
        // Scalar array
        this.sql.exec(
          `INSERT INTO ${arrayTableName} (${fkColumn}, "index", value) VALUES (?, ?, ?);`,
          parentId,
          index,
          item,
        );
      }
    }
  }

  /**
   * Execute an INSERT and return the new row's ID.
   */
  private execInsert(tableName: string, columns: string[], values: unknown[]): number {
    if (columns.length > 0) {
      const placeholders = columns.map(() => '?').join(', ');
      this.sql.exec(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`,
        ...values,
      );
    } else {
      this.sql.exec(`INSERT INTO ${tableName} DEFAULT VALUES;`);
    }

    const result = [...this.sql.exec('SELECT last_insert_rowid() as id')];
    return result[0]?.id as number;
  }

  /**
   * Delete all rows from the table (handles cascade for array tables)
   */
  deleteAll(): void {
    const statements = this.schema.generateDeleteAll(this.tableName);
    for (const stmt of statements) {
      this.sql.exec(stmt);
    }
  }

  /**
   * Replace all data (delete + insert)
   */
  replace(data: Record<string, unknown>): void {
    this.deleteAll();
    this.insert(data);
  }

  /**
   * Select the first row from the table (schema-aware reconstruction)
   */
  selectFirst<T = Record<string, unknown>>(): T | null {
    try {
      return this.schema.readFirst(this.sql, this.tableName) as T | null;
    } catch {
      return null;
    }
  }

  /**
   * Check if the table exists
   */
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
