/**
 * Schema builders - Ergonomic helpers for creating SchemaType objects
 *
 * These return plain typed objects that match SchemaType from @wonder/context.
 * No magic, just convenience functions for common patterns.
 */

import type { SchemaType } from '@wonder/context';

/**
 * Create a string schema with optional constraints
 */
export function string(constraints?: {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
}): SchemaType {
  if (constraints?.enum) {
    return {
      type: 'string',
      enum: constraints.enum,
    };
  }

  return {
    type: 'string',
    ...(constraints?.minLength !== undefined && { minLength: constraints.minLength }),
    ...(constraints?.maxLength !== undefined && { maxLength: constraints.maxLength }),
    ...(constraints?.pattern !== undefined && { pattern: constraints.pattern }),
  };
}

/**
 * Create an integer schema with optional constraints
 */
export function integer(constraints?: {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}): SchemaType {
  return {
    type: 'integer',
    ...(constraints?.minimum !== undefined && { minimum: constraints.minimum }),
    ...(constraints?.maximum !== undefined && { maximum: constraints.maximum }),
    ...(constraints?.exclusiveMinimum !== undefined && {
      exclusiveMinimum: constraints.exclusiveMinimum,
    }),
    ...(constraints?.exclusiveMaximum !== undefined && {
      exclusiveMaximum: constraints.exclusiveMaximum,
    }),
    ...(constraints?.multipleOf !== undefined && { multipleOf: constraints.multipleOf }),
  };
}

/**
 * Create a number schema with optional constraints
 */
export function number(constraints?: {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}): SchemaType {
  return {
    type: 'number',
    ...(constraints?.minimum !== undefined && { minimum: constraints.minimum }),
    ...(constraints?.maximum !== undefined && { maximum: constraints.maximum }),
    ...(constraints?.exclusiveMinimum !== undefined && {
      exclusiveMinimum: constraints.exclusiveMinimum,
    }),
    ...(constraints?.exclusiveMaximum !== undefined && {
      exclusiveMaximum: constraints.exclusiveMaximum,
    }),
    ...(constraints?.multipleOf !== undefined && { multipleOf: constraints.multipleOf }),
  };
}

/**
 * Create a boolean schema
 */
export function boolean(): SchemaType {
  return {
    type: 'boolean',
  };
}

/**
 * Create a null schema
 */
export function nullType(): SchemaType {
  return {
    type: 'null',
  };
}

/**
 * Create an object schema with properties
 */
export function object(
  properties: Record<string, SchemaType>,
  options?: {
    required?: string[];
    additionalProperties?: boolean;
  },
): SchemaType {
  return {
    type: 'object',
    properties,
    additionalProperties: options?.additionalProperties ?? false,
    ...(options?.required && options.required.length > 0 && { required: options.required }),
  };
}

/**
 * Create an array schema
 */
export function array(
  items: SchemaType,
  constraints?: {
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
  },
): SchemaType {
  return {
    type: 'array',
    items,
    ...(constraints?.minItems !== undefined && { minItems: constraints.minItems }),
    ...(constraints?.maxItems !== undefined && { maxItems: constraints.maxItems }),
    ...(constraints?.uniqueItems !== undefined && { uniqueItems: constraints.uniqueItems }),
  };
}

/**
 * Create an enum schema from values
 */
export function enumType(values: unknown[]): SchemaType {
  // Infer type from first value
  const firstValue = values[0];
  const inferredType =
    typeof firstValue === 'string'
      ? 'string'
      : typeof firstValue === 'number'
        ? 'number'
        : typeof firstValue === 'boolean'
          ? 'boolean'
          : 'string';

  return {
    type: inferredType as 'string' | 'number' | 'boolean',
    enum: values,
  };
}

/**
 * Namespace export for fluent API
 *
 * Usage:
 *   import { schema } from '@wonder/sdk/builders';
 *   const mySchema = schema.object({
 *     name: schema.string({ minLength: 1 }),
 *     age: schema.integer({ minimum: 0 }),
 *   });
 */
export const schema = {
  string,
  integer,
  number,
  boolean,
  null: nullType,
  object,
  array,
  enum: enumType,
};
