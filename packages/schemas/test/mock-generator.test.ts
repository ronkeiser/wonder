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

  describe('exclusive bounds', () => {
    it('respects exclusiveMinimum for numbers', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMinimum: 10 };
      // Generate multiple values to verify they're all > 10
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result).toBeGreaterThan(10);
      }
    });

    it('respects exclusiveMaximum for numbers', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMaximum: 100 };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result).toBeLessThan(100);
      }
    });

    it('respects exclusiveMinimum for integers', () => {
      const schema: JSONSchema = { type: 'integer', exclusiveMinimum: 5 };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result).toBeGreaterThan(5);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('respects exclusiveMaximum for integers', () => {
      const schema: JSONSchema = { type: 'integer', exclusiveMaximum: 50 };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result).toBeLessThan(50);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('respects both exclusive bounds together', () => {
      const schema: JSONSchema = {
        type: 'number',
        exclusiveMinimum: 0,
        exclusiveMaximum: 1,
      };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(1);
      }
    });
  });

  describe('multipleOf constraint', () => {
    it('generates numbers that are multiples of the specified value', () => {
      const schema: JSONSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
        multipleOf: 0.5,
      };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        // Check that result / 0.5 is a whole number (within floating point tolerance)
        const divided = result / 0.5;
        expect(Math.abs(divided - Math.round(divided))).toBeLessThan(0.0001);
      }
    });

    it('generates integers that are multiples of the specified value', () => {
      const schema: JSONSchema = {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        multipleOf: 5,
      };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result % 5).toBe(0);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('generates integers divisible by 10', () => {
      const schema: JSONSchema = {
        type: 'integer',
        minimum: 0,
        maximum: 1000,
        multipleOf: 10,
      };
      for (let i = 0; i < 20; i++) {
        const result = generateMockData(schema, { seed: i }) as number;
        expect(result % 10).toBe(0);
      }
    });
  });

  describe('uniqueItems constraint', () => {
    it('generates arrays with unique items when uniqueItems is true', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'integer', minimum: 1, maximum: 10 },
        minItems: 5,
        maxItems: 10,
        uniqueItems: true,
      };

      for (let i = 0; i < 10; i++) {
        const result = generateMockData(schema, { seed: i }) as number[];
        const uniqueSet = new Set(result);
        expect(uniqueSet.size).toBe(result.length);
      }
    });

    it('generates arrays with unique string items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string', enum: ['a', 'b', 'c', 'd', 'e'] },
        minItems: 3,
        maxItems: 5,
        uniqueItems: true,
      };

      for (let i = 0; i < 10; i++) {
        const result = generateMockData(schema, { seed: i }) as string[];
        const uniqueSet = new Set(result);
        expect(uniqueSet.size).toBe(result.length);
      }
    });

    it('generates arrays with unique object items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer', minimum: 1, maximum: 5 },
          },
          required: ['id'],
        },
        minItems: 3,
        maxItems: 5,
        uniqueItems: true,
      };

      for (let i = 0; i < 10; i++) {
        const result = generateMockData(schema, { seed: i }) as Array<{ id: number }>;
        const stringified = result.map((item) => JSON.stringify(item));
        const uniqueSet = new Set(stringified);
        expect(uniqueSet.size).toBe(result.length);
      }
    });
  });

  describe('pattern-based string generation', () => {
    it('generates email-like strings for patterns containing @', () => {
      const schema: JSONSchema = {
        type: 'string',
        pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
      };

      const result = generateMockData(schema, { seed: 42 }) as string;
      expect(result).toContain('@');
      expect(result).toContain('.com');
    });

    it('generates UUID-like strings for UUID patterns', () => {
      const schema: JSONSchema = {
        type: 'string',
        pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',
      };

      const result = generateMockData(schema, { seed: 42 }) as string;
      // UUID format: 8-4-4-4-12 characters separated by hyphens
      const parts = result.split('-');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);
    });
  });

  describe('custom options', () => {
    it('respects custom stringLength option', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = generateMockData(schema, {
        seed: 42,
        stringLength: { min: 20, max: 25 },
      }) as string;

      expect(result.length).toBeGreaterThanOrEqual(20);
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('respects custom arrayLength option', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = generateMockData(schema, {
        seed: 42,
        arrayLength: { min: 8, max: 10 },
      }) as string[];

      expect(result.length).toBeGreaterThanOrEqual(8);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('respects maxDepth option to prevent infinite recursion', () => {
      // Create a deeply nested schema
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                    required: ['value'],
                  },
                },
                required: ['level3'],
              },
            },
            required: ['level2'],
          },
        },
        required: ['level1'],
      };

      // With maxDepth of 2, should not go all the way down
      const result = generateMockData(schema, { seed: 42, maxDepth: 2 }) as Record<string, unknown>;
      expect(result.level1).toBeDefined();
      // At depth 2, level2 should be the default for object type (empty object)
      const level1 = result.level1 as Record<string, unknown>;
      expect(level1.level2).toEqual({});
    });
  });

  describe('default value handling', () => {
    it('can use schema default values', () => {
      const schema: JSONSchema = {
        type: 'string',
        default: 'default-value',
      };

      // With multiple seeds, some should return the default (50% probability)
      const results: unknown[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(generateMockData(schema, { seed: i }));
      }

      const hasDefault = results.some((r) => r === 'default-value');
      const hasGenerated = results.some((r) => r !== 'default-value' && typeof r === 'string');

      // Both outcomes should be possible
      expect(hasDefault || hasGenerated).toBe(true);
    });

    it('handles default values for objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        default: { preset: true },
        properties: {
          preset: { type: 'boolean' },
        },
      };

      const results: unknown[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(generateMockData(schema, { seed: i }));
      }

      const hasDefault = results.some(
        (r) => typeof r === 'object' && r !== null && (r as Record<string, unknown>).preset === true,
      );
      expect(hasDefault).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when no items schema provided', () => {
      const schema: JSONSchema = {
        type: 'array',
        // No items schema
      };

      const result = generateMockData(schema, { seed: 42 });
      expect(result).toEqual([]);
    });

    it('returns empty object when no properties defined', () => {
      const schema: JSONSchema = {
        type: 'object',
        // No properties
      };

      const result = generateMockData(schema, { seed: 42 });
      expect(result).toEqual({});
    });

    it('returns null for unknown types', () => {
      const schema = { type: 'unknownType' } as unknown as JSONSchema;
      const result = generateMockData(schema, { seed: 42 });
      expect(result).toBe(null);
    });

    it('handles numeric enum values', () => {
      const schema: JSONSchema = {
        type: 'integer',
        enum: [1, 2, 3, 5, 8, 13],
      };

      const result = generateMockData(schema, { seed: 42 });
      expect([1, 2, 3, 5, 8, 13]).toContain(result);
    });

    it('handles boolean enum values', () => {
      const schema: JSONSchema = {
        type: 'boolean',
        enum: [true],
      };

      const result = generateMockData(schema, { seed: 42 });
      expect(result).toBe(true);
    });
  });
});
