import { describe, expect, it } from 'vitest';
import { validateSchema, ValidationError, type SchemaType } from '~/domains/schema/validation';

describe('schema validation', () => {
  describe('basic types', () => {
    it('validates string fields', () => {
      const schema: Record<string, SchemaType> = {
        name: { type: 'string' },
      };

      expect(() => validateSchema({ name: 'test' }, schema)).not.toThrow();
      expect(() => validateSchema({ name: 123 }, schema)).toThrow(ValidationError);
    });

    it('validates number fields', () => {
      const schema: Record<string, SchemaType> = {
        age: { type: 'number' },
      };

      expect(() => validateSchema({ age: 42 }, schema)).not.toThrow();
      expect(() => validateSchema({ age: '42' }, schema)).toThrow(ValidationError);
      expect(() => validateSchema({ age: NaN }, schema)).toThrow(ValidationError);
    });

    it('validates boolean fields', () => {
      const schema: Record<string, SchemaType> = {
        active: { type: 'boolean' },
      };

      expect(() => validateSchema({ active: true }, schema)).not.toThrow();
      expect(() => validateSchema({ active: 'true' }, schema)).toThrow(ValidationError);
    });
  });

  describe('required fields', () => {
    it('throws when required field is missing', () => {
      const schema: Record<string, SchemaType> = {
        name: { type: 'string' },
      };

      expect(() => validateSchema({}, schema)).toThrow(ValidationError);
      expect(() => validateSchema({}, schema)).toThrow(/Required field missing/);
    });

    it('requires all root-level fields', () => {
      const schema: Record<string, SchemaType> = {
        name: { type: 'string' },
        age: { type: 'number' },
      };

      expect(() => validateSchema({ name: 'test' }, schema)).toThrow(/Required field missing.*age/);
      expect(() => validateSchema({ name: 'test', age: 25 }, schema)).not.toThrow();
    });
  });

  describe('nested objects', () => {
    it('validates nested object properties', () => {
      const schema: Record<string, SchemaType> = {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      };

      expect(() =>
        validateSchema(
          {
            user: {
              name: 'Alice',
              age: 30,
            },
          },
          schema,
        ),
      ).not.toThrow();

      expect(() =>
        validateSchema(
          {
            user: {
              name: 'Alice',
              age: '30',
            },
          },
          schema,
        ),
      ).toThrow(ValidationError);
    });

    it('validates required nested fields', () => {
      const schema: Record<string, SchemaType> = {
        user: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      };

      expect(() =>
        validateSchema(
          {
            user: {
              age: 30,
            },
          },
          schema,
        ),
      ).toThrow(/Required field missing.*user\.name/);
    });
  });

  describe('arrays', () => {
    it('validates array fields', () => {
      const schema: Record<string, SchemaType> = {
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      };

      expect(() => validateSchema({ tags: ['a', 'b', 'c'] }, schema)).not.toThrow();
      expect(() => validateSchema({ tags: 'not-array' }, schema)).toThrow(ValidationError);
    });

    it('validates array item types', () => {
      const schema: Record<string, SchemaType> = {
        scores: {
          type: 'array',
          items: { type: 'number' },
        },
      };

      expect(() => validateSchema({ scores: [1, 2, 3] }, schema)).not.toThrow();
      expect(() => validateSchema({ scores: [1, '2', 3] }, schema)).toThrow(ValidationError);
    });

    it('validates arrays of objects', () => {
      const schema: Record<string, SchemaType> = {
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
      };

      expect(() =>
        validateSchema(
          {
            users: [
              { name: 'Alice', age: 30 },
              { name: 'Bob', age: 25 },
            ],
          },
          schema,
        ),
      ).not.toThrow();

      expect(() =>
        validateSchema(
          {
            users: [
              { name: 'Alice', age: 30 },
              { name: 'Bob', age: '25' },
            ],
          },
          schema,
        ),
      ).toThrow(ValidationError);
    });
  });

  describe('artifact references', () => {
    it('validates artifact_ref as string', () => {
      const schema: Record<string, SchemaType> = {
        document: { type: 'artifact_ref' },
      };

      expect(() => validateSchema({ document: 'artifact-123' }, schema)).not.toThrow();
      expect(() => validateSchema({ document: 123 }, schema)).toThrow(ValidationError);
    });
  });

  describe('error details', () => {
    it('provides path in error', () => {
      const schema: Record<string, SchemaType> = {
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
      };

      try {
        validateSchema(
          {
            user: {
              profile: {
                age: 'not-a-number',
              },
            },
          },
          schema,
        );
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).path).toBe('root.user.profile.age');
        expect((e as ValidationError).code).toBe('TYPE_MISMATCH');
      }
    });
  });

  describe('edge cases', () => {
    it('rejects null as object', () => {
      const schema: Record<string, SchemaType> = {
        data: { type: 'object' },
      };

      expect(() => validateSchema({ data: null }, schema)).toThrow(ValidationError);
    });

    it('rejects arrays as objects', () => {
      const schema: Record<string, SchemaType> = {
        data: { type: 'object' },
      };

      expect(() => validateSchema({ data: [] }, schema)).toThrow(ValidationError);
    });

    it('rejects root value that is not an object', () => {
      const schema: Record<string, SchemaType> = {
        name: { type: 'string' },
      };

      expect(() => validateSchema('not-object', schema)).toThrow(/Expected object at root/);
      expect(() => validateSchema(null, schema)).toThrow(/Expected object at root/);
      expect(() => validateSchema([], schema)).toThrow(/Expected object at root/);
    });
  });
});
