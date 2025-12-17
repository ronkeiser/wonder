import { describe, expect, it } from 'vitest';
import { CustomTypeRegistry } from '../src/custom-types.js';
import type { JSONSchema } from '../src/types.js';
import { ValidationErrorCode } from '../src/types.js';
import { Validator, validateSchema } from '../src/validation/validator.js';

describe('Validator', () => {
  describe('basic type validation', () => {
    it('should validate string type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 'John' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-string value', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
      expect(result.errors[0].path).toBe('/name');
    });

    it('should validate number type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ age: 25 });
      expect(result.valid).toBe(true);
    });

    it('should validate integer type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ count: 42 });
      expect(result.valid).toBe(true);
    });

    it('should reject float as integer', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ count: 42.5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
    });

    it('should validate boolean type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          active: { type: 'boolean' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ active: true });
      expect(result.valid).toBe(true);
    });

    it('should validate array type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ tags: ['a', 'b', 'c'] });
      expect(result.valid).toBe(true);
    });

    it('should validate object type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ user: { name: 'John', age: 30 } });
      expect(result.valid).toBe(true);
    });

    it('should validate null type', () => {
      const schema: JSONSchema = { type: 'null' };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate(null);
      expect(result.valid).toBe(true);
    });
  });

  describe('required fields', () => {
    it('should validate required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 'John', email: 'john@example.com' });
      expect(result.valid).toBe(true);
    });

    it('should report missing required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 'John' });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.REQUIRED_FIELD_MISSING);
      expect(result.errors[0].path).toBe('/email');
    });

    it('should allow optional fields to be undefined', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nickname: { type: 'string' },
        },
        required: ['name'],
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 'John' });
      expect(result.valid).toBe(true);
    });
  });

  describe('nullable values', () => {
    it('should accept null for nullable types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: { type: 'string', nullable: true },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ value: null });
      expect(result.valid).toBe(true);
    });

    it('should reject null for non-nullable types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ value: null });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
    });
  });

  describe('nested objects', () => {
    it('should validate nested object properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                  age: { type: 'number' },
                },
              },
            },
          },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({
        user: {
          profile: {
            bio: 'Developer',
            age: 30,
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should report nested validation errors with correct paths', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  age: { type: 'number' },
                },
              },
            },
          },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({
        user: {
          profile: {
            age: 'thirty',
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('/user/profile/age');
    });
  });

  describe('arrays', () => {
    it('should validate array items', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          numbers: { type: 'array', items: { type: 'number' } },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ numbers: [1, 2, 3, 4.5] });
      expect(result.valid).toBe(true);
    });

    it('should report errors for invalid array items', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          numbers: { type: 'array', items: { type: 'number' } },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ numbers: [1, '2', 3] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('/numbers/1');
    });

    it('should validate arrays of objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
            },
          },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('custom types', () => {
    it('should validate custom types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          artifact_id: { type: 'artifact_ref' as any },
        },
      };
      const registry = new CustomTypeRegistry();
      registry.register('artifact_ref', {
        validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
      });

      const validator = new Validator(schema, registry);
      const result = validator.validate({ artifact_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid custom type values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          artifact_id: { type: 'artifact_ref' as any },
        },
      };
      const registry = new CustomTypeRegistry();
      registry.register('artifact_ref', {
        validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
      });

      const validator = new Validator(schema, registry);
      const result = validator.validate({ artifact_id: 'not-a-ulid' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.CUSTOM_TYPE_INVALID);
    });

    it('should error on unregistered custom type', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          artifact_id: { type: 'artifact_ref' as any },
        },
      };
      const registry = new CustomTypeRegistry();

      const validator = new Validator(schema, registry);
      const result = validator.validate({ artifact_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Unknown type');
    });
  });

  describe('error collection options', () => {
    it('should collect all errors by default', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 5 },
          age: { type: 'number', minimum: 0 },
          email: { type: 'string' },
        },
        required: ['name', 'age', 'email'],
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate({ name: 'Jo', age: -5 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should stop on first error when collectAllErrors is false', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 5 },
          age: { type: 'number', minimum: 0 },
        },
        required: ['name', 'age'],
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry, { collectAllErrors: false });

      const result = validator.validate({ name: 'Jo', age: -5 });
      expect(result.valid).toBe(false);
      // Should have only 1 error since we stop on first
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('validateSchema helper', () => {
    it('should work as a convenience function', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();

      const result = validateSchema({ name: 'John' }, schema, registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('root data validation', () => {
    it('should reject non-object root data when schema is object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.TYPE_MISMATCH);
    });

    it('should reject array as root data when schema is object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate([1, 2, 3]);
      expect(result.valid).toBe(false);
    });

    it('should reject null as root data when schema is object', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('non-object root schemas', () => {
    it('should validate string at root', () => {
      const schema: JSONSchema = { type: 'string', minLength: 3 };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate('hello');
      expect(result.valid).toBe(true);
    });

    it('should validate array at root', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
      };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate([1, 2, 3]);
      expect(result.valid).toBe(true);
    });

    it('should validate number at root', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0, maximum: 100 };
      const registry = new CustomTypeRegistry();
      const validator = new Validator(schema, registry);

      const result = validator.validate(42);
      expect(result.valid).toBe(true);
    });
  });
});
