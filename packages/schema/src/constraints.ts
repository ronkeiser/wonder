// Type-specific constraint validation logic

import type { SchemaType, ValidationError } from './types.js';
import { ValidationErrorCode } from './types.js';
import { deepEqual, getType, isPlainObject } from './utils.js';

/**
 * Validate a string value with constraints
 */
export function validateString(
  value: unknown,
  schema: SchemaType,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: `Expected string at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'string',
      actual: getType(value),
    });
    return errors;
  }

  // minLength
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      path,
      message: `String length ${value.length} is less than minimum ${schema.minLength}`,
      code: ValidationErrorCode.MIN_LENGTH,
      keyword: 'minLength',
      expected: `length >= ${schema.minLength}`,
      actual: `length = ${value.length}`,
    });
  }

  // maxLength
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      path,
      message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
      code: ValidationErrorCode.MAX_LENGTH,
      keyword: 'maxLength',
      expected: `length <= ${schema.maxLength}`,
      actual: `length = ${value.length}`,
    });
  }

  // pattern
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push({
        path,
        message: `String does not match pattern ${schema.pattern}`,
        code: ValidationErrorCode.PATTERN_MISMATCH,
        keyword: 'pattern',
        expected: `pattern: ${schema.pattern}`,
        actual: value,
      });
    }
  }

  // enum
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `Value '${value}' is not in allowed values: ${schema.enum.join(', ')}`,
      code: ValidationErrorCode.ENUM_MISMATCH,
      keyword: 'enum',
      expected: `one of: ${schema.enum.join(', ')}`,
      actual: value,
    });
  }

  // const
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path,
      message: `Value must be exactly '${schema.const}'`,
      code: ValidationErrorCode.CONST_MISMATCH,
      keyword: 'const',
      expected: String(schema.const),
      actual: value,
    });
  }

  return errors;
}

/**
 * Validate a number value with constraints
 */
export function validateNumber(
  value: unknown,
  schema: SchemaType,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({
      path,
      message: `Expected number at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'number',
      actual: getType(value),
    });
    return errors;
  }

  // minimum
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({
      path,
      message: `Number ${value} is less than minimum ${schema.minimum}`,
      code: ValidationErrorCode.MINIMUM,
      keyword: 'minimum',
      expected: `>= ${schema.minimum}`,
      actual: String(value),
    });
  }

  // maximum
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({
      path,
      message: `Number ${value} exceeds maximum ${schema.maximum}`,
      code: ValidationErrorCode.MAXIMUM,
      keyword: 'maximum',
      expected: `<= ${schema.maximum}`,
      actual: String(value),
    });
  }

  // exclusiveMinimum
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push({
      path,
      message: `Number ${value} must be greater than ${schema.exclusiveMinimum}`,
      code: ValidationErrorCode.EXCLUSIVE_MINIMUM,
      keyword: 'exclusiveMinimum',
      expected: `> ${schema.exclusiveMinimum}`,
      actual: String(value),
    });
  }

  // exclusiveMaximum
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    errors.push({
      path,
      message: `Number ${value} must be less than ${schema.exclusiveMaximum}`,
      code: ValidationErrorCode.EXCLUSIVE_MAXIMUM,
      keyword: 'exclusiveMaximum',
      expected: `< ${schema.exclusiveMaximum}`,
      actual: String(value),
    });
  }

  // multipleOf
  if (schema.multipleOf !== undefined) {
    const quotient = value / schema.multipleOf;
    if (!Number.isInteger(quotient) || quotient * schema.multipleOf !== value) {
      errors.push({
        path,
        message: `Number ${value} is not a multiple of ${schema.multipleOf}`,
        code: ValidationErrorCode.MULTIPLE_OF,
        keyword: 'multipleOf',
        expected: `multiple of ${schema.multipleOf}`,
        actual: String(value),
      });
    }
  }

  // enum
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `Value ${value} is not in allowed values: ${schema.enum.join(', ')}`,
      code: ValidationErrorCode.ENUM_MISMATCH,
      keyword: 'enum',
      expected: `one of: ${schema.enum.join(', ')}`,
      actual: String(value),
    });
  }

  // const
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path,
      message: `Value must be exactly ${schema.const}`,
      code: ValidationErrorCode.CONST_MISMATCH,
      keyword: 'const',
      expected: String(schema.const),
      actual: String(value),
    });
  }

  return errors;
}

/**
 * Validate an integer value with constraints
 */
export function validateInteger(
  value: unknown,
  schema: SchemaType,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    errors.push({
      path,
      message: `Expected integer at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'integer',
      actual: getType(value),
    });
    return errors;
  }

  // Use number validation for all numeric constraints
  return validateNumber(value, schema, path);
}

/**
 * Validate a boolean value
 */
export function validateBoolean(
  value: unknown,
  schema: SchemaType,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'boolean') {
    errors.push({
      path,
      message: `Expected boolean at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'boolean',
      actual: getType(value),
    });
    return errors;
  }

  // enum
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `Value ${value} is not in allowed values: ${schema.enum.join(', ')}`,
      code: ValidationErrorCode.ENUM_MISMATCH,
      keyword: 'enum',
      expected: `one of: ${schema.enum.join(', ')}`,
      actual: String(value),
    });
  }

  // const
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path,
      message: `Value must be exactly ${schema.const}`,
      code: ValidationErrorCode.CONST_MISMATCH,
      keyword: 'const',
      expected: String(schema.const),
      actual: String(value),
    });
  }

  return errors;
}

/**
 * Validate an array value with constraints
 */
export function validateArray(
  value: unknown,
  schema: SchemaType,
  path: string,
  validateValue: (value: unknown, schema: SchemaType, path: string) => ValidationError[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Array.isArray(value)) {
    errors.push({
      path,
      message: `Expected array at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'array',
      actual: getType(value),
    });
    return errors;
  }

  // minItems
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({
      path,
      message: `Array length ${value.length} is less than minimum ${schema.minItems}`,
      code: ValidationErrorCode.MIN_ITEMS,
      keyword: 'minItems',
      expected: `length >= ${schema.minItems}`,
      actual: `length = ${value.length}`,
    });
  }

  // maxItems
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({
      path,
      message: `Array length ${value.length} exceeds maximum ${schema.maxItems}`,
      code: ValidationErrorCode.MAX_ITEMS,
      keyword: 'maxItems',
      expected: `length <= ${schema.maxItems}`,
      actual: `length = ${value.length}`,
    });
  }

  // uniqueItems
  if (schema.uniqueItems) {
    const seen = new Set<number>();
    for (let i = 0; i < value.length; i++) {
      for (let j = i + 1; j < value.length; j++) {
        if (deepEqual(value[i], value[j]) && !seen.has(i)) {
          errors.push({
            path,
            message: `Array has duplicate items at indices ${i} and ${j}`,
            code: ValidationErrorCode.UNIQUE_ITEMS,
            keyword: 'uniqueItems',
            expected: 'unique items',
            actual: `duplicate at [${i}] and [${j}]`,
          });
          seen.add(i);
          break;
        }
      }
    }
  }

  // items validation
  if (schema.items) {
    value.forEach((item, index) => {
      const itemPath = `${path}/${index}`;
      const itemErrors = validateValue(item, schema.items!, itemPath);
      errors.push(...itemErrors);
    });
  }

  return errors;
}

/**
 * Validate an object value with constraints
 */
export function validateObject(
  value: unknown,
  schema: SchemaType,
  path: string,
  validateValue: (value: unknown, schema: SchemaType, path: string) => ValidationError[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPlainObject(value)) {
    errors.push({
      path,
      message: `Expected object at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'object',
      actual: getType(value),
    });
    return errors;
  }

  // required fields
  if (schema.required) {
    for (const requiredField of schema.required) {
      if (!(requiredField in value)) {
        errors.push({
          path: `${path}/${requiredField}`,
          message: `Required field '${requiredField}' is missing`,
          code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
          keyword: 'required',
          expected: 'value',
          actual: 'undefined',
        });
      }
    }
  }

  // properties validation
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propValue = value[key];
      const propPath = `${path}/${key}`;

      // Skip undefined optional fields
      if (propValue === undefined) {
        continue;
      }

      const propErrors = validateValue(propValue, propSchema, propPath);
      errors.push(...propErrors);
    }
  }

  return errors;
}

/**
 * Validate a null value
 */
export function validateNull(value: unknown, _schema: SchemaType, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (value !== null) {
    errors.push({
      path,
      message: `Expected null at ${path}, got ${getType(value)}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'null',
      actual: getType(value),
    });
  }

  return errors;
}
