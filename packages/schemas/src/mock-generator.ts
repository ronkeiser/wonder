/**
 * Mock Data Generator
 *
 * Generates random data conforming to a JSON schema.
 * Useful for testing workflows without real LLM calls or external services.
 */

import type { JSONSchema } from './types.js';

/**
 * Options for mock data generation
 */
export interface MockOptions {
  /** Seed for reproducible random output */
  seed?: number;

  /** Default string length range when not specified in schema */
  stringLength?: { min: number; max: number };

  /** Default array length range when not specified in schema */
  arrayLength?: { min: number; max: number };

  /** Maximum depth for nested objects (prevents infinite recursion) */
  maxDepth?: number;

  /** Simulate execution delay (useful for timeout/performance testing) */
  delay?: { min_ms: number; max_ms: number };
}

/**
 * Simple seeded random number generator (Mulberry32)
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a random float between 0 and 1 */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a random integer between min (inclusive) and max (inclusive) */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns a random float between min and max */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Returns a random boolean */
  nextBool(): boolean {
    return this.next() < 0.5;
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const ALPHA_NUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate mock data conforming to a JSON schema
 */
export function generateMockData(schema: JSONSchema, options: MockOptions = {}): unknown {
  const rng = new SeededRandom(options.seed ?? Date.now());
  const defaults = {
    stringLength: options.stringLength ?? { min: 5, max: 15 },
    arrayLength: options.arrayLength ?? { min: 1, max: 5 },
    maxDepth: options.maxDepth ?? 10,
  };

  return generate(schema, rng, defaults, 0);
}

interface GeneratorDefaults {
  stringLength: { min: number; max: number };
  arrayLength: { min: number; max: number };
  maxDepth: number;
}

function generate(
  schema: JSONSchema,
  rng: SeededRandom,
  defaults: GeneratorDefaults,
  depth: number,
): unknown {
  // Handle nullable - 20% chance of null if nullable
  if (schema.nullable && rng.next() < 0.2) {
    return null;
  }

  // Handle const
  if (schema.const !== undefined) {
    return schema.const;
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    return rng.pick(schema.enum);
  }

  // Handle default (50% chance to use default if provided)
  if (schema.default !== undefined && rng.next() < 0.5) {
    return schema.default;
  }

  // Prevent infinite recursion
  if (depth >= defaults.maxDepth) {
    return getDefaultForType(schema.type);
  }

  switch (schema.type) {
    case 'string':
      return generateString(schema, rng, defaults);
    case 'number':
      return generateNumber(schema, rng);
    case 'integer':
      return generateInteger(schema, rng);
    case 'boolean':
      return rng.nextBool();
    case 'object':
      return generateObject(schema, rng, defaults, depth);
    case 'array':
      return generateArray(schema, rng, defaults, depth);
    case 'null':
      return null;
    default:
      // Unknown type, return null
      return null;
  }
}

function generateString(
  schema: JSONSchema,
  rng: SeededRandom,
  defaults: GeneratorDefaults,
): string {
  const minLen = schema.minLength ?? defaults.stringLength.min;
  const maxLen = schema.maxLength ?? defaults.stringLength.max;
  const length = rng.nextInt(minLen, maxLen);

  // If pattern is specified, try to generate a simple match
  // (Only handles very basic patterns - alphanumeric of correct length)
  if (schema.pattern) {
    // For email-like patterns
    if (schema.pattern.includes('@')) {
      const user = generateRandomString(rng, 5);
      const domain = generateRandomString(rng, 5);
      return `${user}@${domain}.com`;
    }
    // For UUID-like patterns
    if (schema.pattern.includes('-') && schema.pattern.includes('[a-f0-9]')) {
      return generateUUID(rng);
    }
  }

  return generateRandomString(rng, length);
}

function generateRandomString(rng: SeededRandom, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHA_NUMERIC[rng.nextInt(0, ALPHA_NUMERIC.length - 1)];
  }
  return result;
}

function generateUUID(rng: SeededRandom): string {
  const hex = '0123456789abcdef';
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) => {
      let seg = '';
      for (let i = 0; i < len; i++) {
        seg += hex[rng.nextInt(0, 15)];
      }
      return seg;
    })
    .join('-');
}

function generateNumber(schema: JSONSchema, rng: SeededRandom): number {
  let min = schema.minimum ?? schema.exclusiveMinimum ?? -1000;
  let max = schema.maximum ?? schema.exclusiveMaximum ?? 1000;

  // Handle exclusive bounds
  if (schema.exclusiveMinimum !== undefined) {
    min = schema.exclusiveMinimum + 0.001;
  }
  if (schema.exclusiveMaximum !== undefined) {
    max = schema.exclusiveMaximum - 0.001;
  }

  let value = rng.nextFloat(min, max);

  // Handle multipleOf
  if (schema.multipleOf !== undefined) {
    value = Math.round(value / schema.multipleOf) * schema.multipleOf;
    // Ensure still in bounds
    if (value < min) value += schema.multipleOf;
    if (value > max) value -= schema.multipleOf;
  }

  // Round to 2 decimal places for cleaner output
  return Math.round(value * 100) / 100;
}

function generateInteger(schema: JSONSchema, rng: SeededRandom): number {
  let min = schema.minimum ?? schema.exclusiveMinimum ?? -1000;
  let max = schema.maximum ?? schema.exclusiveMaximum ?? 1000;

  // Handle exclusive bounds
  if (schema.exclusiveMinimum !== undefined) {
    min = Math.floor(schema.exclusiveMinimum) + 1;
  }
  if (schema.exclusiveMaximum !== undefined) {
    max = Math.ceil(schema.exclusiveMaximum) - 1;
  }

  let value = rng.nextInt(Math.ceil(min), Math.floor(max));

  // Handle multipleOf
  if (schema.multipleOf !== undefined) {
    value = Math.round(value / schema.multipleOf) * schema.multipleOf;
    // Ensure still in bounds
    if (value < min) value += schema.multipleOf;
    if (value > max) value -= schema.multipleOf;
  }

  return value;
}

function generateObject(
  schema: JSONSchema,
  rng: SeededRandom,
  defaults: GeneratorDefaults,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (!schema.properties) {
    return result;
  }

  const required = new Set(schema.required ?? []);

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    // Always include required properties, 80% chance for optional
    if (required.has(key) || rng.next() < 0.8) {
      result[key] = generate(propSchema, rng, defaults, depth + 1);
    }
  }

  return result;
}

function generateArray(
  schema: JSONSchema,
  rng: SeededRandom,
  defaults: GeneratorDefaults,
  depth: number,
): unknown[] {
  const minItems = schema.minItems ?? defaults.arrayLength.min;
  const maxItems = schema.maxItems ?? defaults.arrayLength.max;
  const length = rng.nextInt(minItems, maxItems);

  const result: unknown[] = [];

  if (!schema.items) {
    // No items schema, return empty array
    return result;
  }

  const seen = new Set<string>();

  for (let i = 0; i < length; i++) {
    const item = generate(schema.items, rng, defaults, depth + 1);

    // Handle uniqueItems
    if (schema.uniqueItems) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        continue; // Skip duplicates
      }
      seen.add(key);
    }

    result.push(item);
  }

  return result;
}

function getDefaultForType(type: string): unknown {
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'array':
      return [];
    case 'null':
    default:
      return null;
  }
}
