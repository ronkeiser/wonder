/**
 * SELECT Generator - Reads schema-driven SQL tables back into structured objects
 *
 * Handles:
 * - Unflattening nested object columns (metadata_timestamp → { metadata: { timestamp } })
 * - Reading array tables and joining back to parent
 * - Converting SQLite types back to JS types (0/1 → boolean)
 */

import type { SqlExecutor } from '../schema.js';
import type { JSONSchema } from '../types.js';

export type SelectGeneratorOptions = {
  /** Strategy used for nested objects in DDL (must match) */
  nestedObjectStrategy?: 'flatten' | 'json';
  /** Strategy used for arrays in DDL (must match) */
  arrayStrategy?: 'table' | 'json';
  /** Prefix used for array table names (must match DDL) */
  arrayTablePrefix?: string;
};

export class SelectGenerator {
  private options: Required<SelectGeneratorOptions>;

  constructor(
    private schema: JSONSchema,
    options: SelectGeneratorOptions = {},
  ) {
    this.options = {
      nestedObjectStrategy: options.nestedObjectStrategy ?? 'flatten',
      arrayStrategy: options.arrayStrategy ?? 'table',
      arrayTablePrefix: options.arrayTablePrefix ?? '',
    };
  }

  /**
   * Read a row from a table and reconstruct as structured object
   */
  readFirst(sql: SqlExecutor, tableName: string): Record<string, unknown> | null {
    // Read main table row
    const mainResult = sql.exec(`SELECT * FROM ${tableName} LIMIT 1;`);
    const mainRows = [...mainResult];

    if (mainRows.length === 0) {
      return null;
    }

    const flatRow = mainRows[0] as Record<string, unknown>;
    const rowId = flatRow.id as number;

    // Reconstruct structured object
    return this.reconstructObject(sql, tableName, flatRow, rowId, this.schema);
  }

  /**
   * Reconstruct a structured object from a flat row
   */
  private reconstructObject(
    sql: SqlExecutor,
    tableName: string,
    flatRow: Record<string, unknown>,
    rowId: number,
    schema: JSONSchema,
    prefix = '',
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (!schema.properties) {
      return result;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const columnName = prefix ? `${prefix}_${fieldName}` : fieldName;

      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        // Recursively reconstruct nested object from flattened columns
        result[fieldName] = this.reconstructObject(
          sql,
          tableName,
          flatRow,
          rowId,
          fieldSchema,
          columnName,
        );
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'table') {
        // Read from array table - use columnName (full path) for table name
        result[fieldName] = this.readArrayTable(sql, tableName, rowId, columnName, fieldSchema);
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'json') {
        // Parse JSON array
        const jsonValue = flatRow[columnName];
        result[fieldName] =
          typeof jsonValue === 'string' ? JSON.parse(jsonValue) : (jsonValue ?? []);
      } else if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'json') {
        // Parse JSON object
        const jsonValue = flatRow[columnName];
        result[fieldName] =
          typeof jsonValue === 'string' ? JSON.parse(jsonValue) : (jsonValue ?? {});
      } else if (fieldSchema.type === 'boolean') {
        // Convert SQLite 0/1 back to boolean
        result[fieldName] = flatRow[columnName] === 1;
      } else {
        // Regular scalar - copy directly
        result[fieldName] = flatRow[columnName];
      }
    }

    return result;
  }

  /**
   * Read an array from its separate table
   */
  private readArrayTable(
    sql: SqlExecutor,
    parentTableName: string,
    parentId: number,
    fieldName: string,
    fieldSchema: JSONSchema,
  ): unknown[] {
    const arrayTableName = `${this.options.arrayTablePrefix}${parentTableName}_${fieldName}`;
    const itemSchema = fieldSchema.items;

    if (!itemSchema) {
      return [];
    }

    try {
      const result = sql.exec(
        `SELECT * FROM ${arrayTableName} WHERE ${parentTableName}_id = ? ORDER BY "index";`,
        parentId,
      );
      const rows = [...result] as Record<string, unknown>[];

      return rows.map((row) => {
        if (itemSchema.type === 'object') {
          // Reconstruct object from flattened columns (excluding FK and index)
          return this.reconstructArrayItem(sql, arrayTableName, row, itemSchema);
        } else if (itemSchema.type === 'boolean') {
          return row.value === 1;
        } else {
          // Scalar array - return value column
          return row.value;
        }
      });
    } catch {
      // Table might not exist
      return [];
    }
  }

  /**
   * Reconstruct an array item object from a row
   */
  private reconstructArrayItem(
    sql: SqlExecutor,
    arrayTableName: string,
    row: Record<string, unknown>,
    itemSchema: JSONSchema,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (!itemSchema.properties) {
      return result;
    }

    // Get the row's ID for reading nested arrays
    const rowId = row.id as number;

    for (const [fieldName, fieldSchema] of Object.entries(itemSchema.properties)) {
      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        // Nested object within array item - reconstruct from prefixed columns
        result[fieldName] = this.reconstructNestedFromRow(row, fieldName, fieldSchema);
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'table') {
        // Nested array - read from child table using this row's ID
        result[fieldName] = this.readArrayTable(sql, arrayTableName, rowId, fieldName, fieldSchema);
      } else if (fieldSchema.type === 'boolean') {
        result[fieldName] = row[fieldName] === 1;
      } else {
        result[fieldName] = row[fieldName];
      }
    }

    return result;
  }

  /**
   * Reconstruct a nested object from prefixed columns in a row
   */
  private reconstructNestedFromRow(
    row: Record<string, unknown>,
    prefix: string,
    schema: JSONSchema,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (!schema.properties) {
      return result;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const columnName = `${prefix}_${fieldName}`;

      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        result[fieldName] = this.reconstructNestedFromRow(row, columnName, fieldSchema);
      } else if (fieldSchema.type === 'boolean') {
        result[fieldName] = row[columnName] === 1;
      } else {
        result[fieldName] = row[columnName];
      }
    }

    return result;
  }
}
