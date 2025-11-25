// Schema validation for Wonder workflow inputs/outputs

// TODO: Additional test coverage needed:
// - Deep nesting (3+ levels)
// - Arrays of arrays
// - Empty arrays validation
// - Mixed valid/invalid items in arrays
// - Strict mode (reject extra fields not in schema)
// - Empty strings and zero values handling
// - Special number values (Infinity, -Infinity)
// - Objects without properties defined
// - Performance with large schemas (100+ fields)

export type SchemaType = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'artifact_ref';
  properties?: Record<string, SchemaType>;
  required?: string[];
  items?: SchemaType;
  artifact_type_id?: string;
};

export class ValidationError extends Error {
  constructor(message: string, public path: string, public code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a value against a schema definition
 * @throws ValidationError if validation fails
 */
export function validateSchema(
  value: unknown,
  schema: Record<string, SchemaType>,
  path = 'root',
): void {
  // Schema is an object with properties
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(
      `Expected object at ${path}, got ${typeof value}`,
      path,
      'TYPE_MISMATCH',
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate each field (all root fields are required by convention)
  for (const [key, fieldSchema] of Object.entries(schema)) {
    const fieldPath = `${path}.${key}`;
    const fieldValue = obj[key];

    // Root-level fields are required
    if (fieldValue === undefined) {
      throw new ValidationError(
        `Required field missing: ${fieldPath}`,
        fieldPath,
        'REQUIRED_FIELD_MISSING',
      );
    }

    // Validate field type
    validateFieldType(fieldValue, fieldSchema, fieldPath);
  }
}

function validateFieldType(value: unknown, schema: SchemaType, path: string): void {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new ValidationError(
          `Expected string at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }
      break;

    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new ValidationError(
          `Expected number at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ValidationError(
          `Expected boolean at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ValidationError(
          `Expected object at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }

      // Validate nested properties
      if (schema.properties) {
        const obj = value as Record<string, unknown>;
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          const propPath = `${path}.${key}`;
          const propValue = obj[key];

          // Check required nested fields
          if (schema.required?.includes(key) && propValue === undefined) {
            throw new ValidationError(
              `Required field missing: ${propPath}`,
              propPath,
              'REQUIRED_FIELD_MISSING',
            );
          }

          if (propValue !== undefined) {
            validateFieldType(propValue, propSchema, propPath);
          }
        }
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        throw new ValidationError(
          `Expected array at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }

      // Validate array items if schema specified
      if (schema.items) {
        (value as unknown[]).forEach((item, index) => {
          validateFieldType(item, schema.items!, `${path}[${index}]`);
        });
      }
      break;

    case 'artifact_ref':
      if (typeof value !== 'string') {
        throw new ValidationError(
          `Expected artifact reference (string) at ${path}, got ${typeof value}`,
          path,
          'TYPE_MISMATCH',
        );
      }
      // Could add format validation (e.g., UUID) here
      break;
  }
}
