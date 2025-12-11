import { describe, expect, it } from 'vitest';
import {
  validateArray,
  validateBoolean,
  validateInteger,
  validateNumber,
  validateObject,
  validateString,
} from '../src/constraints.js';
import type { JSONSchema } from '../src/types.js';
import { ValidationErrorCode } from '../src/types.js';

describe('String constraints', () => {
  it('should validate minLength', () => {
    const schema: JSONSchema = { type: 'string', minLength: 3 };
    const errors = validateString('ab', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MIN_LENGTH);
  });

  it('should pass minLength when valid', () => {
    const schema: JSONSchema = { type: 'string', minLength: 3 };
    const errors = validateString('abc', schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate maxLength', () => {
    const schema: JSONSchema = { type: 'string', maxLength: 5 };
    const errors = validateString('toolong', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MAX_LENGTH);
  });

  it('should pass maxLength when valid', () => {
    const schema: JSONSchema = { type: 'string', maxLength: 5 };
    const errors = validateString('short', schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate pattern', () => {
    const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };
    const errors = validateString('ABC123', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.PATTERN_MISMATCH);
  });

  it('should pass pattern when valid', () => {
    const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };
    const errors = validateString('abc', schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate enum', () => {
    const schema: JSONSchema = { type: 'string', enum: ['red', 'green', 'blue'] };
    const errors = validateString('yellow', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.ENUM_MISMATCH);
  });

  it('should pass enum when valid', () => {
    const schema: JSONSchema = { type: 'string', enum: ['red', 'green', 'blue'] };
    const errors = validateString('red', schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate const', () => {
    const schema: JSONSchema = { type: 'string', const: 'exact' };
    const errors = validateString('wrong', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.CONST_MISMATCH);
  });

  it('should pass const when valid', () => {
    const schema: JSONSchema = { type: 'string', const: 'exact' };
    const errors = validateString('exact', schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate multiple constraints', () => {
    const schema: JSONSchema = {
      type: 'string',
      minLength: 3,
      maxLength: 10,
      pattern: '^[a-z]+$',
    };
    const errors = validateString('AB', schema, '/field');
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('Number constraints', () => {
  it('should validate minimum', () => {
    const schema: JSONSchema = { type: 'number', minimum: 10 };
    const errors = validateNumber(5, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MINIMUM);
  });

  it('should pass minimum when equal', () => {
    const schema: JSONSchema = { type: 'number', minimum: 10 };
    const errors = validateNumber(10, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate maximum', () => {
    const schema: JSONSchema = { type: 'number', maximum: 100 };
    const errors = validateNumber(150, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MAXIMUM);
  });

  it('should pass maximum when equal', () => {
    const schema: JSONSchema = { type: 'number', maximum: 100 };
    const errors = validateNumber(100, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate exclusiveMinimum', () => {
    const schema: JSONSchema = { type: 'number', exclusiveMinimum: 10 };
    const errors = validateNumber(10, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.EXCLUSIVE_MINIMUM);
  });

  it('should pass exclusiveMinimum when greater', () => {
    const schema: JSONSchema = { type: 'number', exclusiveMinimum: 10 };
    const errors = validateNumber(10.1, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate exclusiveMaximum', () => {
    const schema: JSONSchema = { type: 'number', exclusiveMaximum: 100 };
    const errors = validateNumber(100, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.EXCLUSIVE_MAXIMUM);
  });

  it('should pass exclusiveMaximum when less', () => {
    const schema: JSONSchema = { type: 'number', exclusiveMaximum: 100 };
    const errors = validateNumber(99.9, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate multipleOf', () => {
    const schema: JSONSchema = { type: 'number', multipleOf: 5 };
    const errors = validateNumber(17, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MULTIPLE_OF);
  });

  it('should pass multipleOf when valid', () => {
    const schema: JSONSchema = { type: 'number', multipleOf: 5 };
    const errors = validateNumber(15, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should reject NaN', () => {
    const schema: JSONSchema = { type: 'number' };
    const errors = validateNumber(NaN, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
  });

  it('should reject Infinity', () => {
    const schema: JSONSchema = { type: 'number' };
    const errors = validateNumber(Infinity, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
  });
});

describe('Integer constraints', () => {
  it('should reject float values', () => {
    const schema: JSONSchema = { type: 'integer' };
    const errors = validateInteger(42.5, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
  });

  it('should accept integer values', () => {
    const schema: JSONSchema = { type: 'integer' };
    const errors = validateInteger(42, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should apply number constraints to integers', () => {
    const schema: JSONSchema = { type: 'integer', minimum: 10, maximum: 20 };
    const errors = validateInteger(5, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MINIMUM);
  });
});

describe('Boolean constraints', () => {
  it('should validate boolean type', () => {
    const schema: JSONSchema = { type: 'boolean' };
    const errors = validateBoolean('true', schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
  });

  it('should accept true', () => {
    const schema: JSONSchema = { type: 'boolean' };
    const errors = validateBoolean(true, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should accept false', () => {
    const schema: JSONSchema = { type: 'boolean' };
    const errors = validateBoolean(false, schema, '/field');
    expect(errors).toHaveLength(0);
  });

  it('should validate enum', () => {
    const schema: JSONSchema = { type: 'boolean', enum: [true] };
    const errors = validateBoolean(false, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.ENUM_MISMATCH);
  });

  it('should validate const', () => {
    const schema: JSONSchema = { type: 'boolean', const: true };
    const errors = validateBoolean(false, schema, '/field');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.CONST_MISMATCH);
  });
});

describe('Array constraints', () => {
  const mockValidate = (value: unknown, _schema: JSONSchema, _path: string) => {
    if (typeof value !== 'string') {
      return [
        {
          path: _path,
          message: 'Expected string',
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'string',
          actual: typeof value,
        },
      ];
    }
    return [];
  };

  it('should validate minItems', () => {
    const schema: JSONSchema = { type: 'array', minItems: 3 };
    const errors = validateArray([1, 2], schema, '/field', mockValidate);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MIN_ITEMS);
  });

  it('should pass minItems when valid', () => {
    const schema: JSONSchema = { type: 'array', minItems: 2 };
    const errors = validateArray([1, 2, 3], schema, '/field', mockValidate);
    expect(errors).toHaveLength(0);
  });

  it('should validate maxItems', () => {
    const schema: JSONSchema = { type: 'array', maxItems: 2 };
    const errors = validateArray([1, 2, 3], schema, '/field', mockValidate);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.MAX_ITEMS);
  });

  it('should pass maxItems when valid', () => {
    const schema: JSONSchema = { type: 'array', maxItems: 3 };
    const errors = validateArray([1, 2], schema, '/field', mockValidate);
    expect(errors).toHaveLength(0);
  });

  it('should validate uniqueItems', () => {
    const schema: JSONSchema = { type: 'array', uniqueItems: true };
    const errors = validateArray([1, 2, 2, 3], schema, '/field', mockValidate);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe(ValidationErrorCode.UNIQUE_ITEMS);
  });

  it('should pass uniqueItems when valid', () => {
    const schema: JSONSchema = { type: 'array', uniqueItems: true };
    const errors = validateArray([1, 2, 3], schema, '/field', mockValidate);
    expect(errors).toHaveLength(0);
  });

  it('should validate array items', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'string' },
    };
    const errors = validateArray(['a', 'b', 123], schema, '/field', mockValidate);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toBe('/field/2');
  });
});

describe('Object constraints', () => {
  const mockValidate = (value: unknown, schema: JSONSchema, _path: string) => {
    if (schema.type === 'string' && typeof value !== 'string') {
      return [
        {
          path: _path,
          message: 'Expected string',
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'string',
          actual: typeof value,
        },
      ];
    }
    if (schema.type === 'number' && typeof value !== 'number') {
      return [
        {
          path: _path,
          message: 'Expected number',
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'number',
          actual: typeof value,
        },
      ];
    }
    return [];
  };

  it('should validate object properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };
    const errors = validateObject({ name: 'John', age: 'thirty' }, schema, '/field', mockValidate);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should validate required fields', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name', 'email'],
    };
    const errors = validateObject({ name: 'John' }, schema, '/field', mockValidate);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(ValidationErrorCode.REQUIRED_FIELD_MISSING);
    expect(errors[0].path).toBe('/field/email');
  });

  it('should pass when all required fields present', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    };
    const errors = validateObject({ name: 'John' }, schema, '/field', mockValidate);
    expect(errors).toHaveLength(0);
  });

  it('should allow undefined optional fields', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { type: 'string' },
      },
      required: ['name'],
    };
    const errors = validateObject({ name: 'John' }, schema, '/field', mockValidate);
    expect(errors).toHaveLength(0);
  });
});
