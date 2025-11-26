// Type definitions for @wonderful/validator

export type SchemaType = {
  // Core type
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'artifact_ref';

  // Nullability
  nullable?: boolean;

  // Object
  properties?: Record<string, SchemaType>;
  required?: string[];
  additionalProperties?: boolean | SchemaType;
  minProperties?: number;
  maxProperties?: number;

  // Array
  items?: SchemaType;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'email' | 'url' | 'uuid' | 'ulid' | 'date' | 'date-time' | 'hostname' | 'ipv4' | 'ipv6';

  // Number/Integer
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Enum
  enum?: unknown[];
  const?: unknown;

  // Composition
  oneOf?: SchemaType[];
  anyOf?: SchemaType[];
  allOf?: SchemaType[];
  not?: SchemaType;

  // References
  $ref?: string;
  $defs?: Record<string, SchemaType>;

  // Defaults & metadata
  default?: unknown;
  title?: string;
  description?: string;
  errorMessage?: string;

  // Wonder-specific
  artifact_type_id?: string;
};

export class ValidationError extends Error {
  constructor(
    message: string,
    public path: string,
    public code: string,
    public keyword?: string,
    public schemaPath?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidatorOptions {
  applyDefaults?: boolean;
  collectAllErrors?: boolean;
  strictMode?: boolean;
  errorMessages?: boolean;
}
