// Core schema type definition (JSONSchema subset)
export type JSONSchema = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

  // Object validation
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;

  // Array validation
  items?: JSONSchema;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string; // Regex pattern

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array constraints
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // General constraints
  enum?: unknown[];
  const?: unknown;

  // Composition
  nullable?: boolean;

  // Metadata
  description?: string;
  default?: unknown;
};

// Custom type definition (for extensibility)
export type CustomTypeDefinition = {
  // Validation function - returns true if valid
  validate: (value: unknown, schema: JSONSchema, path: string) => boolean;

  // SQL mapping (for DDL generation - Phase 2)
  toSQL?: () => SQLTypeMapping;

  // Optional metadata
  description?: string;
  examples?: unknown[];
};

// SQL type mapping for DDL generation
export type SQLTypeMapping = {
  // Base SQLite type
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

  // Optional SQL constraints
  constraints?: string[];
};

// Validation result - collects all errors
export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  data?: unknown; // Validated data (possibly with defaults applied)
};

// Rich error information
export type ValidationError = {
  path: string; // JSON Pointer (e.g., "/user/addresses/0/city")
  message: string; // Human-readable error message
  code: ValidationErrorCode; // Machine-readable error code
  expected?: string; // Expected type/value
  actual?: string; // Actual type/value received
  keyword?: string; // Schema keyword that failed (minLength, pattern, etc.)
};

// Error codes for programmatic error handling
export enum ValidationErrorCode {
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  MIN_LENGTH = 'MIN_LENGTH',
  MAX_LENGTH = 'MAX_LENGTH',
  PATTERN_MISMATCH = 'PATTERN_MISMATCH',
  MINIMUM = 'MINIMUM',
  MAXIMUM = 'MAXIMUM',
  EXCLUSIVE_MINIMUM = 'EXCLUSIVE_MINIMUM',
  EXCLUSIVE_MAXIMUM = 'EXCLUSIVE_MAXIMUM',
  MULTIPLE_OF = 'MULTIPLE_OF',
  MIN_ITEMS = 'MIN_ITEMS',
  MAX_ITEMS = 'MAX_ITEMS',
  UNIQUE_ITEMS = 'UNIQUE_ITEMS',
  ENUM_MISMATCH = 'ENUM_MISMATCH',
  CONST_MISMATCH = 'CONST_MISMATCH',
  CUSTOM_TYPE_INVALID = 'CUSTOM_TYPE_INVALID',
}

// Validator options
export type ValidatorOptions = {
  // Collect all errors (true) or fail on first error (false)
  collectAllErrors?: boolean; // default: true

  // Apply default values from schema
  applyDefaults?: boolean; // default: false

  // Allow null for nullable types
  strictNullChecks?: boolean; // default: true
};
