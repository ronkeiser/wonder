/**
 * Shared types for SQL generators (DDL, DML, Select)
 */

/**
 * Strategy options shared across all SQL generators.
 * These must be consistent between DDL (schema creation), DML (data manipulation),
 * and Select (data retrieval) to ensure proper round-tripping.
 */
export type GeneratorOptions = {
  /**
   * Strategy for nested objects:
   * - 'flatten': Nested object fields become prefixed columns (e.g., metadata_timestamp)
   * - 'json': Nested objects stored as JSON TEXT column
   */
  nestedObjectStrategy?: 'flatten' | 'json';

  /**
   * Strategy for arrays:
   * - 'table': Arrays stored in separate tables with foreign key references
   * - 'json': Arrays stored as JSON TEXT column
   */
  arrayStrategy?: 'table' | 'json';

  /**
   * Prefix for array table names when using table strategy
   */
  arrayTablePrefix?: string;
};

/**
 * Normalized options with all fields required (defaults applied)
 */
export type NormalizedGeneratorOptions = Required<GeneratorOptions>;

/**
 * Default values for generator options
 */
export const DEFAULT_GENERATOR_OPTIONS: NormalizedGeneratorOptions = {
  nestedObjectStrategy: 'flatten',
  arrayStrategy: 'table',
  arrayTablePrefix: '',
};

/**
 * Normalize generator options by applying defaults
 */
export function normalizeOptions(options: GeneratorOptions = {}): NormalizedGeneratorOptions {
  return {
    nestedObjectStrategy: options.nestedObjectStrategy ?? DEFAULT_GENERATOR_OPTIONS.nestedObjectStrategy,
    arrayStrategy: options.arrayStrategy ?? DEFAULT_GENERATOR_OPTIONS.arrayStrategy,
    arrayTablePrefix: options.arrayTablePrefix ?? DEFAULT_GENERATOR_OPTIONS.arrayTablePrefix,
  };
}

/**
 * Column definition for DDL generation
 */
export type ColumnDefinition = {
  name: string;
  type: string;
  constraints: string[];
};

/**
 * Result of INSERT statement generation
 */
export type InsertResult = {
  statements: string[];
  values: unknown[][];
};

/**
 * Result of UPDATE statement generation
 */
export type UpdateResult = {
  statements: string[];
  values: unknown[][];
};
