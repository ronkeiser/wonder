// Core validator implementation

import type { CustomTypeRegistry } from '../custom-types';
import type { JSONSchema, ValidationError, ValidationResult, ValidatorOptions } from '../types';
import { ValidationErrorCode } from '../types';
import { getType } from '../utils';
import {
  validateArray,
  validateBoolean,
  validateInteger,
  validateNull,
  validateNumber,
  validateObject,
  validateString,
} from './constraints';

export class Validator {
  private options: Required<ValidatorOptions>;

  constructor(
    private schema: JSONSchema,
    private customTypes: CustomTypeRegistry,
    options: ValidatorOptions = {},
  ) {
    this.options = {
      collectAllErrors: options.collectAllErrors ?? true,
      applyDefaults: options.applyDefaults ?? false,
      strictNullChecks: options.strictNullChecks ?? true,
    };
  }

  /**
   * Main validation entry point
   */
  validate(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate data against the root schema
    const valueErrors = this.validateValue(data, this.schema, '');
    errors.push(...valueErrors);

    return {
      valid: errors.length === 0,
      errors,
      data: this.options.applyDefaults ? this.applyDefaults(data) : data,
    };
  }

  /**
   * Recursive value validation
   */
  private validateValue(value: unknown, schema: JSONSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Handle nullable
    if (value === null) {
      // If schema explicitly expects null, delegate to validateNull
      if (schema.type === 'null') {
        return validateNull(value, schema, path);
      }
      // Otherwise handle nullable flag
      if (schema.nullable) {
        return []; // null is valid
      }
      if (this.options.strictNullChecks) {
        errors.push({
          path,
          message: `Expected ${schema.type}, got null`,
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: schema.type,
          actual: 'null',
        });
      }
      return errors;
    }

    // Check if custom type
    if (this.customTypes.has(schema.type)) {
      return this.validateCustomType(value, schema, path);
    }

    // Validate by type
    switch (schema.type) {
      case 'string':
        errors.push(...validateString(value, schema, path));
        break;
      case 'number':
        errors.push(...validateNumber(value, schema, path));
        break;
      case 'integer':
        errors.push(...validateInteger(value, schema, path));
        break;
      case 'boolean':
        errors.push(...validateBoolean(value, schema, path));
        break;
      case 'object':
        errors.push(...validateObject(value, schema, path, this.validateValue.bind(this)));
        break;
      case 'array':
        errors.push(...validateArray(value, schema, path, this.validateValue.bind(this)));
        break;
      case 'null':
        errors.push(...validateNull(value, schema, path));
        break;
      default:
        errors.push({
          path,
          message: `Unknown type '${schema.type}'`,
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'valid type',
          actual: schema.type,
        });
    }

    // Stop on first error if not collecting all
    if (!this.options.collectAllErrors && errors.length > 0) {
      return errors.slice(0, 1);
    }

    return errors;
  }

  /**
   * Custom type validation
   */
  private validateCustomType(value: unknown, schema: JSONSchema, path: string): ValidationError[] {
    const customType = this.customTypes.get(schema.type);
    if (!customType) {
      return [
        {
          path,
          message: `Custom type '${schema.type}' not registered`,
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'registered custom type',
          actual: schema.type,
        },
      ];
    }

    const isValid = customType.validate(value, schema, path);
    if (!isValid) {
      return [
        {
          path,
          message: `Invalid ${schema.type} at ${path}`,
          code: ValidationErrorCode.CUSTOM_TYPE_INVALID,
          expected: schema.type,
          actual: getType(value),
        },
      ];
    }

    return [];
  }

  /**
   * Apply default values (if enabled)
   */
  private applyDefaults(data: unknown): unknown {
    // TODO: Implement default value application in Phase 1.5
    // For now, just return the data as-is
    return data;
  }
}

/**
 * Convenience function for simple validation
 */
export function validateSchema(
  data: unknown,
  schema: JSONSchema,
  customTypes: CustomTypeRegistry,
  options?: ValidatorOptions,
): ValidationResult {
  const validator = new Validator(schema, customTypes, options);
  return validator.validate(data);
}
