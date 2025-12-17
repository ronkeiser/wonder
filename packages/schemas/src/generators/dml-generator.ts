// DML (Data Manipulation Language) Generator - INSERT/UPDATE/DELETE statements

import type { CustomTypeRegistry } from '../custom-types';
import type { JSONSchema } from '../types';
import {
  type GeneratorOptions,
  type InsertResult,
  type NormalizedGeneratorOptions,
  type UpdateResult,
  normalizeOptions,
} from './shared';
import { buildArrayTableName, buildColumnName, buildForeignKeyColumnName } from './shared/naming';
import { booleanToSql, encodeJsonValue } from './shared/value-codecs';

// Re-export for backwards compatibility
export type { InsertResult, UpdateResult };
export type DMLGeneratorOptions = GeneratorOptions;

export class DMLGenerator {
  private options: NormalizedGeneratorOptions;

  constructor(
    private schema: JSONSchema,
    _customTypes: CustomTypeRegistry,
    options: GeneratorOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  /**
   * Generate INSERT statement(s) for a data object
   */
  generateInsert(tableName: string, data: Record<string, unknown>): InsertResult {
    if (this.schema.type !== 'object') {
      throw new Error('DML generation requires an object schema at root');
    }

    const statements: string[] = [];
    const values: unknown[][] = [];

    // Generate main table insert
    const { columns, vals } = this.extractColumnsAndValues(data, this.schema, '');

    if (columns.length > 0) {
      const placeholders = columns.map(() => '?').join(', ');
      statements.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`);
      values.push(vals);
    } else {
      // Even with no scalar columns, we need a row for FK references from array tables
      // Use SQLite's default values syntax
      statements.push(`INSERT INTO ${tableName} DEFAULT VALUES;`);
      values.push([]);
    }

    // Generate array table inserts
    if (this.options.arrayStrategy === 'table') {
      const arrayInserts = this.generateArrayInserts(tableName, data, this.schema, '{{PARENT_ID}}');
      statements.push(...arrayInserts.statements);
      values.push(...arrayInserts.values);
    }

    return { statements, values };
  }

  /**
   * Generate UPDATE statement for a data object
   */
  generateUpdate(
    tableName: string,
    data: Record<string, unknown>,
    whereClause: string,
  ): UpdateResult {
    if (this.schema.type !== 'object') {
      throw new Error('DML generation requires an object schema at root');
    }

    const statements: string[] = [];
    const values: unknown[][] = [];

    // Generate main table update
    const { columns, vals } = this.extractColumnsAndValues(data, this.schema, '');

    if (columns.length > 0) {
      const setClauses = columns.map((col) => `${col} = ?`).join(', ');
      statements.push(`UPDATE ${tableName} SET ${setClauses} WHERE ${whereClause};`);
      values.push(vals);
    }

    // For arrays with table strategy, you'd typically DELETE and re-INSERT
    if (this.options.arrayStrategy === 'table') {
      const arrayDeletes = this.generateArrayDeletes(tableName, this.schema, whereClause);
      statements.push(...arrayDeletes);
      // Add empty values arrays for DELETE statements
      arrayDeletes.forEach(() => values.push([]));

      const arrayInserts = this.generateArrayInserts(tableName, data, this.schema, '{{PARENT_ID}}');
      statements.push(...arrayInserts.statements);
      values.push(...arrayInserts.values);
    }

    return { statements, values };
  }

  /**
   * Generate DELETE statement(s) - includes cascade deletes for array tables
   */
  generateDelete(tableName: string, whereClause: string): string[] {
    const statements: string[] = [];

    // Delete from array tables first (foreign key constraint)
    if (this.options.arrayStrategy === 'table') {
      const arrayDeletes = this.generateArrayDeletes(tableName, this.schema, whereClause);
      statements.push(...arrayDeletes);
    }

    // Delete from main table
    statements.push(`DELETE FROM ${tableName} WHERE ${whereClause};`);

    return statements;
  }

  /**
   * Extract columns and values from data based on schema
   */
  private extractColumnsAndValues(
    data: Record<string, unknown>,
    schema: JSONSchema,
    prefix: string,
  ): { columns: string[]; vals: unknown[] } {
    const columns: string[] = [];
    const vals: unknown[] = [];

    if (!schema.properties) {
      return { columns, vals };
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const value = data[fieldName];
      const columnName = buildColumnName(prefix, fieldName);

      // Skip undefined values
      if (value === undefined) {
        continue;
      }

      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        // Flatten nested object
        const nested = this.extractColumnsAndValues(
          value as Record<string, unknown>,
          fieldSchema,
          columnName,
        );
        columns.push(...nested.columns);
        vals.push(...nested.vals);
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'table') {
        // Arrays stored in separate tables - skip
        continue;
      } else if (fieldSchema.type === 'object' || fieldSchema.type === 'array') {
        // Store as JSON
        columns.push(columnName);
        vals.push(encodeJsonValue(value));
      } else if (fieldSchema.type === 'boolean') {
        // SQLite stores boolean as 0/1
        columns.push(columnName);
        vals.push(booleanToSql(value as boolean));
      } else {
        // Regular scalar value
        columns.push(columnName);
        vals.push(value);
      }
    }

    return { columns, vals };
  }

  /**
   * Generate INSERT statements for array tables (including arrays nested in flattened objects)
   */
  private generateArrayInserts(
    parentTableName: string,
    data: Record<string, unknown>,
    schema: JSONSchema,
    parentIdPlaceholder: string,
    prefix = '',
  ): InsertResult {
    const statements: string[] = [];
    const values: unknown[][] = [];

    if (!schema.properties) {
      return { statements, values };
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const fieldValue = data[fieldName];
      if (fieldValue === undefined) continue;

      const pathName = buildColumnName(prefix, fieldName);

      // Recurse into nested objects with flatten strategy to find arrays inside them
      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        const nestedInserts = this.generateArrayInserts(
          parentTableName,
          fieldValue as Record<string, unknown>,
          fieldSchema,
          parentIdPlaceholder,
          pathName,
        );
        statements.push(...nestedInserts.statements);
        values.push(...nestedInserts.values);
        continue;
      }

      if (fieldSchema.type === 'array' && fieldSchema.items) {
        const arrayValue = fieldValue;
        if (!Array.isArray(arrayValue)) {
          continue;
        }

        const arrayTableName = buildArrayTableName(
          parentTableName,
          pathName,
          this.options.arrayTablePrefix,
        );
        const itemSchema = fieldSchema.items;
        const fkColumnName = buildForeignKeyColumnName(parentTableName);

        for (let index = 0; index < arrayValue.length; index++) {
          const item = arrayValue[index];

          if (itemSchema.type === 'object') {
            // Array of objects
            const { columns, vals } = this.extractColumnsAndValues(
              item as Record<string, unknown>,
              itemSchema,
              '',
            );

            const allColumns = [fkColumnName, '"index"', ...columns];
            const allVals = [parentIdPlaceholder, index, ...vals];
            const placeholders = allColumns.map(() => '?').join(', ');

            statements.push(
              `INSERT INTO ${arrayTableName} (${allColumns.join(', ')}) VALUES (${placeholders});`,
            );
            values.push(allVals);
          } else {
            // Array of scalars
            const allColumns = [fkColumnName, '"index"', 'value'];
            const allVals = [parentIdPlaceholder, index, item];

            statements.push(
              `INSERT INTO ${arrayTableName} (${allColumns.join(', ')}) VALUES (?, ?, ?);`,
            );
            values.push(allVals);
          }
        }
      }
    }

    return { statements, values };
  }

  /**
   * Generate DELETE statements for array tables (including arrays nested in flattened objects)
   */
  private generateArrayDeletes(
    parentTableName: string,
    schema: JSONSchema,
    parentWhereClause: string,
    prefix = '',
  ): string[] {
    const statements: string[] = [];

    if (!schema.properties) {
      return statements;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const pathName = buildColumnName(prefix, fieldName);

      // Recurse into nested objects with flatten strategy to find arrays inside them
      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        const nestedDeletes = this.generateArrayDeletes(
          parentTableName,
          fieldSchema,
          parentWhereClause,
          pathName,
        );
        statements.push(...nestedDeletes);
        continue;
      }

      if (fieldSchema.type === 'array' && fieldSchema.items) {
        const arrayTableName = buildArrayTableName(
          parentTableName,
          pathName,
          this.options.arrayTablePrefix,
        );
        const fkColumnName = buildForeignKeyColumnName(parentTableName);

        // Use subquery to properly cascade delete based on parent FK
        statements.push(
          `DELETE FROM ${arrayTableName} WHERE ${fkColumnName} IN (SELECT id FROM ${parentTableName} WHERE ${parentWhereClause});`,
        );
      }
    }

    return statements;
  }

  /**
   * Generate parameterized query helpers
   */
  generateParameterizedInsert(tableName: string): string {
    if (this.schema.type !== 'object') {
      throw new Error('DML generation requires an object schema at root');
    }

    const columns: string[] = [];
    this.collectColumns(this.schema, '', columns);

    if (columns.length === 0) {
      throw new Error('No columns found in schema');
    }

    const placeholders = columns.map(() => '?').join(', ');
    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
  }

  /**
   * Collect all column names from schema (for parameterized queries)
   */
  private collectColumns(schema: JSONSchema, prefix: string, columns: string[]): void {
    if (!schema.properties) {
      return;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const columnName = buildColumnName(prefix, fieldName);

      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        this.collectColumns(fieldSchema, columnName, columns);
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'table') {
        // Skip - handled separately
        continue;
      } else {
        columns.push(columnName);
      }
    }
  }
}
