// DDL Generator - converts JSONSchema to SQLite DDL

import type { CustomTypeRegistry } from './custom-types.js';
import type { JSONSchema } from './types.js';

export type ColumnDefinition = {
  name: string;
  type: string;
  constraints: string[];
};

export type DDLGeneratorOptions = {
  // Strategy for nested objects: 'flatten' (dot notation) or 'json' (JSON column)
  nestedObjectStrategy?: 'flatten' | 'json';

  // Strategy for arrays: 'table' (separate table with FK) or 'json' (JSON column)
  arrayStrategy?: 'table' | 'json';

  // Prefix for array table names
  arrayTablePrefix?: string;
};

export class DDLGenerator {
  private options: Required<DDLGeneratorOptions>;

  constructor(
    private schema: JSONSchema,
    private customTypes: CustomTypeRegistry,
    options: DDLGeneratorOptions = {},
  ) {
    this.options = {
      nestedObjectStrategy: options.nestedObjectStrategy ?? 'flatten',
      arrayStrategy: options.arrayStrategy ?? 'table',
      arrayTablePrefix: options.arrayTablePrefix ?? '',
    };
  }

  /**
   * Generate CREATE TABLE statement
   */
  generateDDL(tableName: string): string {
    if (this.schema.type !== 'object') {
      throw new Error('DDL generation requires an object schema at root');
    }

    const columns = this.generateColumns(this.schema, '');
    const arrayTables = this.generateArrayTables(tableName, this.schema);

    // Add primary key as first column
    const pkColumn = {
      name: 'id',
      type: 'INTEGER',
      constraints: ['PRIMARY KEY AUTOINCREMENT'],
    };

    // Build CREATE TABLE statement
    const allColumns = [pkColumn, ...columns];
    const columnDefs = allColumns.map((col) => {
      const parts = [col.name, col.type];
      if (col.constraints.length > 0) {
        parts.push(...col.constraints);
      }
      return `  ${parts.join(' ')}`;
    });

    let ddl = `CREATE TABLE ${tableName} (\n${columnDefs.join(',\n')}\n);`;

    // Add array tables if any
    if (arrayTables.length > 0) {
      ddl += '\n\n' + arrayTables.join('\n\n');
    }

    return ddl;
  }

  /**
   * Generate column definitions from schema
   */
  private generateColumns(schema: JSONSchema, prefix: string): ColumnDefinition[] {
    const columns: ColumnDefinition[] = [];

    if (!schema.properties) {
      return columns;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      // Skip 'id' field - we add it automatically as PRIMARY KEY
      if (fieldName === 'id' && !prefix) {
        continue;
      }

      const columnName = prefix ? `${prefix}_${fieldName}` : fieldName;
      const isRequired = schema.required?.includes(fieldName) ?? false;

      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        // Flatten nested objects with dot notation
        const nestedColumns = this.generateColumns(fieldSchema, columnName);
        columns.push(...nestedColumns);
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'json') {
        // Store array as JSON
        columns.push({
          name: columnName,
          type: 'TEXT',
          constraints: this.buildConstraints(fieldSchema, isRequired, columnName, true),
        });
      } else if (fieldSchema.type === 'array' && this.options.arrayStrategy === 'table') {
        // Arrays handled as separate tables - skip column
        continue;
      } else {
        // Regular scalar field
        const sqlType = this.mapTypeToSQL(fieldSchema);
        columns.push({
          name: columnName,
          type: sqlType,
          constraints: this.buildConstraints(fieldSchema, isRequired, columnName),
        });
      }
    }

    return columns;
  }

  /**
   * Generate separate tables for arrays
   */
  private generateArrayTables(parentTableName: string, schema: JSONSchema, prefix = ''): string[] {
    const tables: string[] = [];

    if (!schema.properties || this.options.arrayStrategy !== 'table') {
      return tables;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const pathName = prefix ? `${prefix}_${fieldName}` : fieldName;

      // Handle nested objects with flatten strategy - recurse to find arrays inside
      if (fieldSchema.type === 'object' && this.options.nestedObjectStrategy === 'flatten') {
        const nestedTables = this.generateArrayTables(parentTableName, fieldSchema, pathName);
        tables.push(...nestedTables);
        continue;
      }

      if (fieldSchema.type === 'array' && fieldSchema.items) {
        const arrayTableName = `${this.options.arrayTablePrefix}${parentTableName}_${pathName}`;
        const itemSchema = fieldSchema.items;

        // Build array table columns
        // Include id PRIMARY KEY so nested arrays can reference this table
        const columns: ColumnDefinition[] = [
          {
            name: 'id',
            type: 'INTEGER',
            constraints: ['PRIMARY KEY AUTOINCREMENT'],
          },
          {
            name: `${parentTableName}_id`,
            type: 'INTEGER',
            constraints: ['NOT NULL'],
          },
          {
            name: '"index"', // Quote reserved keyword
            type: 'INTEGER',
            constraints: ['NOT NULL'],
          },
        ];

        if (itemSchema.type === 'object') {
          // Array of objects - flatten the object
          const itemColumns = this.generateColumns(itemSchema, '');
          columns.push(...itemColumns);
        } else {
          // Array of scalars
          const sqlType = this.mapTypeToSQL(itemSchema);
          columns.push({
            name: 'value',
            type: sqlType,
            constraints: this.buildConstraints(itemSchema, true, 'value'),
          });
        }

        // Build CREATE TABLE statement
        const columnDefs = columns.map((col) => {
          const parts = [col.name, col.type];
          if (col.constraints.length > 0) {
            parts.push(...col.constraints);
          }
          return `  ${parts.join(' ')}`;
        });

        const fkConstraint = `  FOREIGN KEY (${parentTableName}_id) REFERENCES ${parentTableName}(id)`;

        const ddl = `CREATE TABLE ${arrayTableName} (\n${columnDefs.join(
          ',\n',
        )},\n${fkConstraint}\n);`;
        tables.push(ddl);

        // Recursively handle nested arrays in object items
        if (itemSchema.type === 'object') {
          const nestedTables = this.generateArrayTables(arrayTableName, itemSchema);
          tables.push(...nestedTables);
        }
      }
    }

    return tables;
  }

  /**
   * Map JSONSchema to SQLite type
   */
  private mapTypeToSQL(schema: JSONSchema): string {
    // Check if custom type with SQL mapping
    if (this.customTypes.has(schema.type)) {
      const customType = this.customTypes.get(schema.type);
      const sqlMapping = customType?.toSQL?.();
      if (sqlMapping) {
        return sqlMapping.type;
      }
    }

    // Map standard types
    switch (schema.type) {
      case 'string':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'number':
        return 'REAL';
      case 'boolean':
        return 'INTEGER'; // SQLite uses 0/1 for boolean
      case 'object':
        return 'TEXT'; // Store as JSON
      case 'array':
        return 'TEXT'; // Store as JSON (if not using separate table)
      case 'null':
        return 'TEXT'; // Nullable column
      default:
        return 'TEXT'; // Fallback
    }
  }

  /**
   * Build SQL constraints from schema
   *
   * Note: JSONSchema's `required` array indicates fields that must be present
   * in a complete document, but does NOT map to SQL NOT NULL. This allows
   * incremental writes during workflow execution. Completeness validation
   * happens at read time via schema validation, not write time via SQL.
   */
  private buildConstraints(
    schema: JSONSchema,
    _isRequired: boolean,
    columnName: string,
    isJsonColumn = false,
  ): string[] {
    const constraints: string[] = [];

    // Skip other constraints for JSON columns
    if (isJsonColumn) {
      return constraints;
    }

    // Check if custom type with SQL constraints
    if (this.customTypes.has(schema.type)) {
      const customType = this.customTypes.get(schema.type);
      const sqlMapping = customType?.toSQL?.();
      if (sqlMapping?.constraints) {
        constraints.push(...sqlMapping.constraints);
      }
      return constraints;
    }

    // String constraints
    if (schema.type === 'string') {
      const checks: string[] = [];

      if (schema.minLength !== undefined) {
        checks.push(`length(${columnName}) >= ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined) {
        checks.push(`length(${columnName}) <= ${schema.maxLength}`);
      }
      if (schema.pattern !== undefined) {
        // SQLite doesn't have native regex, but we can add a comment
        // Pattern validation would need to be done at application level
        // constraints.push(`/* pattern: ${schema.pattern} */`);
      }

      if (checks.length > 0) {
        constraints.push(`CHECK (${checks.join(' AND ')})`);
      }
    }

    // Number constraints
    if (schema.type === 'number' || schema.type === 'integer') {
      const checks: string[] = [];

      if (schema.minimum !== undefined) {
        checks.push(`${columnName} >= ${schema.minimum}`);
      }
      if (schema.maximum !== undefined) {
        checks.push(`${columnName} <= ${schema.maximum}`);
      }
      if (schema.exclusiveMinimum !== undefined) {
        checks.push(`${columnName} > ${schema.exclusiveMinimum}`);
      }
      if (schema.exclusiveMaximum !== undefined) {
        checks.push(`${columnName} < ${schema.exclusiveMaximum}`);
      }

      if (checks.length > 0) {
        constraints.push(`CHECK (${checks.join(' AND ')})`);
      }
    }

    // Enum constraint
    if (schema.enum !== undefined && schema.enum.length > 0) {
      const values = schema.enum
        .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
        .join(', ');
      constraints.push(`CHECK (${columnName} IN (${values}))`);
    }

    return constraints;
  }

  /**
   * Get all table names that would be created
   */
  getTableNames(tableName: string): string[] {
    const tables = [tableName];

    if (this.schema.type === 'object' && this.options.arrayStrategy === 'table') {
      const arrayTableNames = this.collectArrayTableNames(tableName, this.schema);
      tables.push(...arrayTableNames);
    }

    return tables;
  }

  /**
   * Collect array table names recursively
   */
  private collectArrayTableNames(parentTableName: string, schema: JSONSchema): string[] {
    const tableNames: string[] = [];

    if (!schema.properties) {
      return tableNames;
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (fieldSchema.type === 'array' && fieldSchema.items) {
        const arrayTableName = `${this.options.arrayTablePrefix}${parentTableName}_${fieldName}`;
        tableNames.push(arrayTableName);

        // Recursively handle nested arrays in object items
        if (fieldSchema.items.type === 'object') {
          const nestedNames = this.collectArrayTableNames(arrayTableName, fieldSchema.items);
          tableNames.push(...nestedNames);
        }
      }
    }

    return tableNames;
  }
}
