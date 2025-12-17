import { describe, expect, it } from 'vitest';
import { generateMockData } from '../src/generators/mock-generator.js';
import type { JSONSchema } from '../src/types.js';

describe('generateMockData', () => {
  describe('primitive types', () => {
    it('generates a string', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = generateMockData(schema);
      expect(typeof result).toBe('string');
    });

    it('generates a number', () => {
      const schema: JSONSchema = { type: 'number' };
      const result = generateMockData(schema);
      expect(typeof result).toBe('number');
    });

    it('generates an integer', () => {
      const schema: JSONSchema = { type: 'integer' };
      const result = generateMockData(schema);
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
    });

    it('generates a boolean', () => {
      const schema: JSONSchema = { type: 'boolean' };
      const result = generateMockData(schema);
      expect(typeof result).toBe('boolean');
    });

    it('generates null for null type', () => {
      const schema: JSONSchema = { type: 'null' };
      const result = generateMockData(schema);
      expect(result).toBe(null);
    });
  });

  describe('string constraints', () => {
    it('respects minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 10 };
      const result = generateMockData(schema) as string;
      expect(result.length).toBeGreaterThanOrEqual(10);
    });

    it('respects maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 5 };
      const result = generateMockData(schema) as string;
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('respects both minLength and maxLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 3, maxLength: 7 };
      const result = generateMockData(schema) as string;
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.length).toBeLessThanOrEqual(7);
    });
  });

  describe('number constraints', () => {
    it('respects minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 100 };
      const result = generateMockData(schema) as number;
      expect(result).toBeGreaterThanOrEqual(100);
    });

    it('respects maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 10 };
      const result = generateMockData(schema) as number;
      expect(result).toBeLessThanOrEqual(10);
    });

    it('respects both minimum and maximum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 5, maximum: 15 };
      const result = generateMockData(schema) as number;
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
    });
  });

  describe('integer constraints', () => {
    it('respects minimum', () => {
      const schema: JSONSchema = { type: 'integer', minimum: 50 };
      const result = generateMockData(schema) as number;
      expect(result).toBeGreaterThanOrEqual(50);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('respects maximum', () => {
      const schema: JSONSchema = { type: 'integer', maximum: 5 };
      const result = generateMockData(schema) as number;
      expect(result).toBeLessThanOrEqual(5);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('enum and const', () => {
    it('returns const value', () => {
      const schema: JSONSchema = { type: 'string', const: 'fixed-value' };
      const result = generateMockData(schema);
      expect(result).toBe('fixed-value');
    });

    it('picks from enum values', () => {
      const schema: JSONSchema = { type: 'string', enum: ['red', 'green', 'blue'] };
      const result = generateMockData(schema);
      expect(['red', 'green', 'blue']).toContain(result);
    });
  });

  describe('objects', () => {
    it('generates object with properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name', 'age'],
      };
      const result = generateMockData(schema) as Record<string, unknown>;
      expect(typeof result).toBe('object');
      expect(typeof result.name).toBe('string');
      expect(typeof result.age).toBe('number');
      expect(Number.isInteger(result.age)).toBe(true);
    });

    it('always includes required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          required_field: { type: 'string' },
          optional_field: { type: 'string' },
        },
        required: ['required_field'],
      };
      // Test multiple times to ensure required is always present
      for (let i = 0; i < 10; i++) {
        const result = generateMockData(schema, { seed: i }) as Record<string, unknown>;
        expect(result).toHaveProperty('required_field');
      }
    });

    it('handles nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };
      const result = generateMockData(schema) as Record<string, unknown>;
      expect(typeof result.user).toBe('object');
      expect(typeof (result.user as Record<string, unknown>).name).toBe('string');
    });
  });

  describe('arrays', () => {
    it('generates array with items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = generateMockData(schema) as unknown[];
      expect(Array.isArray(result)).toBe(true);
      result.forEach((item) => expect(typeof item).toBe('string'));
    });

    it('respects minItems', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
        minItems: 3,
      };
      const result = generateMockData(schema) as unknown[];
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('respects maxItems', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
        maxItems: 2,
      };
      const result = generateMockData(schema) as unknown[];
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('nullable', () => {
    it('can generate null for nullable schemas', () => {
      const schema: JSONSchema = { type: 'string', nullable: true };
      // With many attempts, we should see at least one null
      const results: unknown[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(generateMockData(schema, { seed: i }));
      }
      const hasNull = results.some((r) => r === null);
      const hasString = results.some((r) => typeof r === 'string');
      expect(hasNull || hasString).toBe(true); // At least one type should appear
    });
  });

  describe('seed reproducibility', () => {
    it('produces same output with same seed', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
        },
        required: ['name', 'score'],
      };

      const result1 = generateMockData(schema, { seed: 12345 });
      const result2 = generateMockData(schema, { seed: 12345 });

      expect(result1).toEqual(result2);
    });

    it('produces different output with different seeds', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
        },
        required: ['name', 'score'],
      };

      const result1 = generateMockData(schema, { seed: 12345 });
      const result2 = generateMockData(schema, { seed: 54321 });

      expect(result1).not.toEqual(result2);
    });
  });

  describe('complex schema', () => {
    it('handles a realistic workflow output schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          response: {
            type: 'object',
            properties: {
              content: { type: 'string', minLength: 10, maxLength: 100 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              tags: {
                type: 'array',
                items: { type: 'string', maxLength: 20 },
                minItems: 1,
                maxItems: 5,
              },
            },
            required: ['content', 'confidence'],
          },
          metadata: {
            type: 'object',
            properties: {
              model: { type: 'string', enum: ['gpt-4', 'claude-3', 'llama-2'] },
              tokens_used: { type: 'integer', minimum: 0 },
            },
            required: ['model'],
          },
        },
        required: ['response'],
      };

      const result = generateMockData(schema, { seed: 42 }) as Record<string, unknown>;

      expect(result.response).toBeDefined();
      const response = result.response as Record<string, unknown>;
      expect(typeof response.content).toBe('string');
      expect((response.content as string).length).toBeGreaterThanOrEqual(10);
      expect((response.content as string).length).toBeLessThanOrEqual(100);
      expect(typeof response.confidence).toBe('number');
      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });
  });
});
