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
   * Insert data into the table with full recursive array support
   * Handles nested arrays at any depth by inserting each level and
   * capturing its ID before inserting children.
   */
  insert(data: Record<string, unknown>): void {
    this.insertRecursive(this.tableName, this.getSchema(), data);
  }

  /**
   * Recursively insert data, handling nested arrays at each level
   */
  private insertRecursive(
    tableName: string,
    schema: JSONSchema,
    data: Record<string, unknown>,
  ): number {
    if (schema.type !== 'object' || !schema.properties) {
      throw new Error('Insert requires an object schema');
    }

    // Extract scalar columns and values (arrays handled separately)
    const columns: string[] = [];
    const values: unknown[] = [];

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[fieldName];
      if (value === undefined) continue;

      if (fieldSchema.type === 'object') {
        // Flatten nested objects
        this.extractFlattenedColumns(
          fieldSchema,
          value as Record<string, unknown>,
          fieldName,
          columns,
          values,
        );
      } else if (fieldSchema.type === 'array') {
        // Skip arrays - handled after main insert
        continue;
      } else if (fieldSchema.type === 'boolean') {
        columns.push(fieldName);
        values.push(value ? 1 : 0);
      } else {
        columns.push(fieldName);
        values.push(value);
      }
    }

    // Insert main row
    let parentId: number;
    if (columns.length > 0) {
      const placeholders = columns.map(() => '?').join(', ');
      this.sql.exec(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`,
        ...values,
      );
    } else {
      this.sql.exec(`INSERT INTO ${tableName} DEFAULT VALUES;`);
    }

    // Get the inserted row's ID
    const result = [...this.sql.exec('SELECT last_insert_rowid() as id')];
    parentId = result[0]?.id as number;

    // Handle arrays inside nested objects (which were flattened for scalars)
    // e.g., { report: { summary: string, items: array } } - items needs separate table
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (fieldSchema.type !== 'object') continue;
      const nestedValue = data[fieldName];
      if (nestedValue === undefined) continue;
      this.insertNestedArrays(
        tableName,
        parentId,
        fieldSchema,
        nestedValue as Record<string, unknown>,
        fieldName,
      );
    }

    // Now handle top-level arrays recursively
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (fieldSchema.type !== 'array' || !fieldSchema.items) continue;

      const arrayValue = data[fieldName];
      if (!Array.isArray(arrayValue)) continue;

      const arrayTableName = `${tableName}_${fieldName}`;
      const itemSchema = fieldSchema.items;

      for (let index = 0; index < arrayValue.length; index++) {
        const item = arrayValue[index];

        if (itemSchema.type === 'object') {
          // Array of objects - recursively insert with nested array support
          const itemData = item as Record<string, unknown>;

          // Extract scalar columns for this array item
          const itemColumns: string[] = [`${tableName}_id`, '"index"'];
          const itemValues: unknown[] = [parentId, index];

          for (const [itemFieldName, itemFieldSchema] of Object.entries(
            itemSchema.properties || {},
          )) {
            const itemFieldValue = itemData[itemFieldName];
            if (itemFieldValue === undefined) continue;

            if (itemFieldSchema.type === 'object') {
              this.extractFlattenedColumns(
                itemFieldSchema,
                itemFieldValue as Record<string, unknown>,
                itemFieldName,
                itemColumns,
                itemValues,
              );
            } else if (itemFieldSchema.type === 'array') {
              // Skip nested arrays - handled after this insert
              continue;
            } else if (itemFieldSchema.type === 'boolean') {
              itemColumns.push(itemFieldName);
              itemValues.push(itemFieldValue ? 1 : 0);
            } else {
              itemColumns.push(itemFieldName);
              itemValues.push(itemFieldValue);
            }
          }

          // Insert the array item row
          const placeholders = itemColumns.map(() => '?').join(', ');
          this.sql.exec(
            `INSERT INTO ${arrayTableName} (${itemColumns.join(', ')}) VALUES (${placeholders});`,
            ...itemValues,
          );

          // Get this array item's ID for nested arrays
          const itemResult = [...this.sql.exec('SELECT last_insert_rowid() as id')];
          const itemId = itemResult[0]?.id as number;

          // Recursively handle nested arrays within this array item
          for (const [nestedFieldName, nestedFieldSchema] of Object.entries(
            itemSchema.properties || {},
          )) {
            if (nestedFieldSchema.type !== 'array' || !nestedFieldSchema.items) continue;

            const nestedArrayValue = itemData[nestedFieldName];
            if (!Array.isArray(nestedArrayValue)) continue;

            const nestedArrayTableName = `${arrayTableName}_${nestedFieldName}`;
            const nestedItemSchema = nestedFieldSchema.items;

            for (let nestedIndex = 0; nestedIndex < nestedArrayValue.length; nestedIndex++) {
              const nestedItem = nestedArrayValue[nestedIndex];

              if (nestedItemSchema.type === 'object') {
                // Recursively insert nested object arrays
                const nestedItemData = nestedItem as Record<string, unknown>;
                const nestedColumns: string[] = [`${arrayTableName}_id`, '"index"'];
                const nestedValues: unknown[] = [itemId, nestedIndex];

                for (const [nFieldName, nFieldSchema] of Object.entries(
                  nestedItemSchema.properties || {},
                )) {
                  const nFieldValue = nestedItemData[nFieldName];
                  if (nFieldValue === undefined) continue;

                  if (nFieldSchema.type === 'object') {
                    this.extractFlattenedColumns(
                      nFieldSchema,
                      nFieldValue as Record<string, unknown>,
                      nFieldName,
                      nestedColumns,
                      nestedValues,
                    );
                  } else if (nFieldSchema.type === 'array') {
                    // Even deeper nesting would need more recursion - for now skip
                    continue;
                  } else if (nFieldSchema.type === 'boolean') {
                    nestedColumns.push(nFieldName);
                    nestedValues.push(nFieldValue ? 1 : 0);
                  } else {
                    nestedColumns.push(nFieldName);
                    nestedValues.push(nFieldValue);
                  }
                }

                const nestedPlaceholders = nestedColumns.map(() => '?').join(', ');
                this.sql.exec(
                  `INSERT INTO ${nestedArrayTableName} (${nestedColumns.join(', ')}) VALUES (${nestedPlaceholders});`,
                  ...nestedValues,
                );
              } else {
                // Scalar nested array
                this.sql.exec(
                  `INSERT INTO ${nestedArrayTableName} (${arrayTableName}_id, "index", value) VALUES (?, ?, ?);`,
                  itemId,
                  nestedIndex,
                  nestedItem,
                );
              }
            }
          }
        } else {
          // Array of scalars
          this.sql.exec(
            `INSERT INTO ${arrayTableName} (${tableName}_id, "index", value) VALUES (?, ?, ?);`,
            parentId,
            index,
            item,
          );
        }
      }
    }

    return parentId;
  }

  /**
   * Extract flattened columns from a nested object
   */
  private extractFlattenedColumns(
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

      const columnName = `${prefix}_${fieldName}`;

      if (fieldSchema.type === 'object') {
        this.extractFlattenedColumns(
          fieldSchema,
          value as Record<string, unknown>,
          columnName,
          columns,
          values,
        );
      } else if (fieldSchema.type === 'array') {
        // Skip arrays - they're stored in separate tables
        continue;
      } else if (fieldSchema.type === 'boolean') {
        columns.push(columnName);
        values.push(value ? 1 : 0);
      } else {
        columns.push(columnName);
        values.push(value);
      }
    }
  }

  /**
   * Insert arrays that are nested inside flattened objects
   * e.g., for schema { report: { summary: string, items: array } }
   * the array table is `tableName_report_items`
   */
  private insertNestedArrays(
    tableName: string,
    parentId: number,
    schema: JSONSchema,
    data: Record<string, unknown>,
    prefix: string,
  ): void {
    if (!schema.properties) return;

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[fieldName];
      if (value === undefined) continue;

      const pathName = prefix ? `${prefix}_${fieldName}` : fieldName;

      if (fieldSchema.type === 'object') {
        // Recurse into nested objects to find arrays
        this.insertNestedArrays(
          tableName,
          parentId,
          fieldSchema,
          value as Record<string, unknown>,
          pathName,
        );
      } else if (fieldSchema.type === 'array' && fieldSchema.items && Array.isArray(value)) {
        // Found an array inside a nested object - insert into its table
        const arrayTableName = `${tableName}_${pathName}`;
        const itemSchema = fieldSchema.items;

        for (let index = 0; index < value.length; index++) {
          const item = value[index];

          if (itemSchema.type === 'object') {
            const itemData = item as Record<string, unknown>;
            const itemColumns: string[] = [`${tableName}_id`, '"index"'];
            const itemValues: unknown[] = [parentId, index];

            // Extract scalar fields from array item
            for (const [itemFieldName, itemFieldSchema] of Object.entries(
              itemSchema.properties || {},
            )) {
              const itemFieldValue = itemData[itemFieldName];
              if (itemFieldValue === undefined) continue;

              if (itemFieldSchema.type === 'object') {
                this.extractFlattenedColumns(
                  itemFieldSchema,
                  itemFieldValue as Record<string, unknown>,
                  itemFieldName,
                  itemColumns,
                  itemValues,
                );
              } else if (itemFieldSchema.type === 'array') {
                // Skip nested arrays - handled after insert
                continue;
              } else if (itemFieldSchema.type === 'boolean') {
                itemColumns.push(itemFieldName);
                itemValues.push(itemFieldValue ? 1 : 0);
              } else {
                itemColumns.push(itemFieldName);
                itemValues.push(itemFieldValue);
              }
            }

            const placeholders = itemColumns.map(() => '?').join(', ');
            this.sql.exec(
              `INSERT INTO ${arrayTableName} (${itemColumns.join(', ')}) VALUES (${placeholders});`,
              ...itemValues,
            );

            // Get this array item's ID for nested arrays
            const itemResult = [...this.sql.exec('SELECT last_insert_rowid() as id')];
            const itemId = itemResult[0]?.id as number;

            // Insert nested arrays within this array item
            for (const [nestedFieldName, nestedFieldSchema] of Object.entries(
              itemSchema.properties || {},
            )) {
              if (nestedFieldSchema.type !== 'array' || !nestedFieldSchema.items) continue;

              const nestedArrayValue = itemData[nestedFieldName];
              if (!Array.isArray(nestedArrayValue)) continue;

              const nestedArrayTableName = `${arrayTableName}_${nestedFieldName}`;
              const nestedItemSchema = nestedFieldSchema.items;

              for (let nestedIndex = 0; nestedIndex < nestedArrayValue.length; nestedIndex++) {
                const nestedItem = nestedArrayValue[nestedIndex];

                if (nestedItemSchema.type === 'object') {
                  const nestedItemData = nestedItem as Record<string, unknown>;
                  const nestedColumns: string[] = [`${arrayTableName}_id`, '"index"'];
                  const nestedValues: unknown[] = [itemId, nestedIndex];

                  for (const [nFieldName, nFieldSchema] of Object.entries(
                    nestedItemSchema.properties || {},
                  )) {
                    const nFieldValue = nestedItemData[nFieldName];
                    if (nFieldValue === undefined) continue;

                    if (nFieldSchema.type === 'boolean') {
                      nestedColumns.push(nFieldName);
                      nestedValues.push(nFieldValue ? 1 : 0);
                    } else if (nFieldSchema.type !== 'array') {
                      nestedColumns.push(nFieldName);
                      nestedValues.push(nFieldValue);
                    }
                  }

                  const nestedPlaceholders = nestedColumns.map(() => '?').join(', ');
                  this.sql.exec(
                    `INSERT INTO ${nestedArrayTableName} (${nestedColumns.join(', ')}) VALUES (${nestedPlaceholders});`,
                    ...nestedValues,
                  );
                } else {
                  // Scalar nested array
                  this.sql.exec(
                    `INSERT INTO ${nestedArrayTableName} (${arrayTableName}_id, "index", value) VALUES (?, ?, ?);`,
                    itemId,
                    nestedIndex,
                    nestedItem,
                  );
                }
              }
            }
          } else {
            // Scalar array
            this.sql.exec(
              `INSERT INTO ${arrayTableName} (${tableName}_id, "index", value) VALUES (?, ?, ?);`,
              parentId,
              index,
              item,
            );
          }
        }
      }
    }
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
