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
   * Insert data into the table
   */
  insert(data: Record<string, unknown>): void {
    const { statements, values } = this.schema.generateInsert(this.tableName, data);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]);
    }
  }

  /**
   * Delete all rows from the table
   */
  deleteAll(): void {
    this.sql.exec(`DELETE FROM ${this.tableName};`);
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
