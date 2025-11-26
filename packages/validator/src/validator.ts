// Validator implementation - coming soon

import type { SchemaType, ValidationResult, ValidatorOptions } from './types.js';
import { ValidationError } from './types.js';

export class Validator {
  constructor(private schema: SchemaType, private options: ValidatorOptions = {}) {}

  validate(data: unknown): ValidationResult {
    // TODO: Implement validation logic
    throw new Error('Not implemented yet - see docs/plan.md');
  }
}

export function validateSchema(
  data: unknown,
  schema: SchemaType,
  options?: ValidatorOptions,
): void {
  const validator = new Validator(schema, options);
  const result = validator.validate(data);

  if (!result.valid && result.errors.length > 0) {
    throw result.errors[0];
  }
}
