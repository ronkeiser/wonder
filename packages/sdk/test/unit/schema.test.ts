/**
 * Unit tests for schema builders
 */

import { describe, expect, it } from 'vitest';
import {
  array,
  boolean,
  enumType,
  integer,
  nullType,
  number,
  object,
  schema,
  string,
} from '../../src/builders/schema';

describe('schema builders', () => {
  describe('string()', () => {
    it('creates basic string schema', () => {
      expect(string()).toEqual({ type: 'string' });
    });

    it('creates string with minLength/maxLength', () => {
      expect(string({ minLength: 1, maxLength: 100 })).toEqual({
        type: 'string',
        minLength: 1,
        maxLength: 100,
      });
    });

    it('creates string with pattern', () => {
      expect(string({ pattern: '^[a-z]+$' })).toEqual({
        type: 'string',
        pattern: '^[a-z]+$',
      });
    });

    it('creates string enum', () => {
      expect(string({ enum: ['a', 'b', 'c'] })).toEqual({
        type: 'string',
        enum: ['a', 'b', 'c'],
      });
    });
  });

  describe('integer()', () => {
    it('creates basic integer schema', () => {
      expect(integer()).toEqual({ type: 'integer' });
    });

    it('creates integer with min/max', () => {
      expect(integer({ minimum: 0, maximum: 100 })).toEqual({
        type: 'integer',
        minimum: 0,
        maximum: 100,
      });
    });

    it('creates integer with exclusive bounds', () => {
      expect(integer({ exclusiveMinimum: 0, exclusiveMaximum: 100 })).toEqual({
        type: 'integer',
        exclusiveMinimum: 0,
        exclusiveMaximum: 100,
      });
    });

    it('creates integer with multipleOf', () => {
      expect(integer({ multipleOf: 5 })).toEqual({
        type: 'integer',
        multipleOf: 5,
      });
    });
  });

  describe('number()', () => {
    it('creates basic number schema', () => {
      expect(number()).toEqual({ type: 'number' });
    });

    it('creates number with constraints', () => {
      expect(number({ minimum: 0.5, maximum: 99.9 })).toEqual({
        type: 'number',
        minimum: 0.5,
        maximum: 99.9,
      });
    });
  });

  describe('boolean()', () => {
    it('creates boolean schema', () => {
      expect(boolean()).toEqual({ type: 'boolean' });
    });
  });

  describe('nullType()', () => {
    it('creates null schema', () => {
      expect(nullType()).toEqual({ type: 'null' });
    });
  });

  describe('object()', () => {
    it('creates object with properties and additionalProperties false by default', () => {
      const result = object({
        name: string(),
        age: integer(),
      });

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        additionalProperties: false,
      });
    });

    it('creates object with required fields', () => {
      const result = object(
        {
          name: string(),
          email: string(),
        },
        { required: ['name', 'email'] },
      );

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        additionalProperties: false,
        required: ['name', 'email'],
      });
    });

    it('omits empty required array', () => {
      const result = object({ name: string() }, { required: [] });

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      });
    });

    it('allows explicit additionalProperties true', () => {
      const result = object({ name: string() }, { additionalProperties: true });

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: true,
      });
    });
  });

  describe('array()', () => {
    it('creates array with items', () => {
      expect(array(string())).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('creates array with constraints', () => {
      expect(array(integer(), { minItems: 1, maxItems: 10, uniqueItems: true })).toEqual({
        type: 'array',
        items: { type: 'integer' },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
      });
    });
  });

  describe('enumType()', () => {
    it('creates enum from string values', () => {
      expect(enumType(['red', 'green', 'blue'])).toEqual({
        type: 'string',
        enum: ['red', 'green', 'blue'],
      });
    });

    it('creates enum from number values', () => {
      expect(enumType([1, 2, 3])).toEqual({
        type: 'number',
        enum: [1, 2, 3],
      });
    });

    it('creates enum from boolean values', () => {
      expect(enumType([true, false])).toEqual({
        type: 'boolean',
        enum: [true, false],
      });
    });
  });

  describe('schema namespace', () => {
    it('exports all builders', () => {
      expect(schema.string).toBe(string);
      expect(schema.integer).toBe(integer);
      expect(schema.number).toBe(number);
      expect(schema.boolean).toBe(boolean);
      expect(schema.null).toBe(nullType);
      expect(schema.object).toBe(object);
      expect(schema.array).toBe(array);
      expect(schema.enum).toBe(enumType);
    });

    it('can be used fluently', () => {
      const result = schema.object(
        {
          name: schema.string({ minLength: 1 }),
          age: schema.integer({ minimum: 0 }),
          tags: schema.array(schema.string()),
        },
        { required: ['name'] },
      );

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          age: { type: 'integer', minimum: 0 },
          tags: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
        required: ['name'],
      });
    });
  });

  describe('nested schemas', () => {
    it('creates nested object schemas', () => {
      const result = object({
        user: object(
          {
            name: string(),
            email: string({ pattern: '^.+@.+$' }),
          },
          { required: ['name', 'email'] },
        ),
        settings: object({
          theme: string({ enum: ['light', 'dark'] }),
        }),
      });

      expect(result).toEqual({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', pattern: '^.+@.+$' },
            },
            additionalProperties: false,
            required: ['name', 'email'],
          },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string', enum: ['light', 'dark'] },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      });
    });

    it('creates array of objects', () => {
      const result = array(
        object(
          {
            id: string(),
            value: integer(),
          },
          { required: ['id'] },
        ),
      );

      expect(result).toEqual({
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            value: { type: 'integer' },
          },
          required: ['id'],
        },
      });
    });
  });
});
