# Custom Types in @wonder/schemas

## Overview

`@wonder/schemas` is a combined validation and DDL generation library for runtime schemas. It supports **custom type extensions** that allow applications to define domain-specific types (like Wonder's `artifact_ref`) that work seamlessly across both validation and SQL generation.

## Why Custom Types?

Custom types provide:

1. **Explicit schemas**: `type: 'artifact_ref'` is clearer than `type: 'string', format: 'ulid', _ref_type: 'artifact'`
2. **Single registration point**: Define validation and SQL mapping together
3. **Semantic clarity**: Type name communicates domain meaning
4. **Better TypeScript discrimination**: `schema.type === 'artifact_ref'` works naturally
5. **Unified extension**: One concept for both validation and DDL generation

## Custom Type Definition

```typescript
export type CustomTypeDefinition = {
  // Validation function (returns true if valid)
  validate: (value: unknown, schema: JSONSchema, path: string) => boolean;

  // SQL type mapping
  sqlType: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
  sqlConstraints?: string[]; // Optional CHECK constraints

  // Optional metadata
  description?: string;
  examples?: unknown[];
};
```

## Registration

```typescript
import { Schema } from '@wonder/schemas';

const schema = new Schema(schemaDefinition);

// Register artifact_ref type
schema.registerCustomType('artifact_ref', {
  validate: (value) => {
    return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
  },
  sqlType: 'TEXT',
  sqlConstraints: ['CHECK(length(value) = 26)'],
  description: 'Reference to an artifact by ULID',
  examples: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
});

// Register workflow_ref type
schema.registerCustomType('workflow_ref', {
  validate: (value) => {
    return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
  },
  sqlType: 'TEXT',
  sqlConstraints: ['CHECK(length(value) = 26)'],
  description: 'Reference to a workflow definition by ULID',
});
```

## Using Custom Types in Schemas

```typescript
const workflowSchema = {
  artifact_id: {
    type: 'artifact_ref',
    artifact_type_id: 'adr_type_uuid', // Application metadata
  },
  workflow_id: {
    type: 'workflow_ref',
  },
  count: {
    type: 'integer',
  },
};

const schema = new Schema(workflowSchema);
```

## Validation

Custom types participate in standard validation:

```typescript
// Valid data
const data = {
  artifact_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  workflow_id: '01BRZ3NDEKTSV4RRFFQ69G5FAV',
  count: 42,
};

schema.validate(data); // ✓ Passes

// Invalid type
const badData = {
  artifact_id: 123, // Wrong type
  workflow_id: '01BRZ3NDEKTSV4RRFFQ69G5FAV',
  count: 42,
};

schema.validate(badData);
// Error: "Expected artifact_ref at .artifact_id, got number"

// Invalid format
const badFormat = {
  artifact_id: 'not-a-ulid', // Wrong format
  workflow_id: '01BRZ3NDEKTSV4RRFFQ69G5FAV',
  count: 42,
};

schema.validate(badFormat);
// Error: "Invalid artifact_ref at .artifact_id"
```

## DDL Generation

Custom types automatically map to SQL:

```typescript
const ddl = schema.generateDDL('context');

// Generates:
// CREATE TABLE context (
//   artifact_id TEXT NOT NULL CHECK(length(artifact_id) = 26),
//   workflow_id TEXT NOT NULL CHECK(length(workflow_id) = 26),
//   count INTEGER NOT NULL
// )
```

## Complete Example: Wonder API

```typescript
// services/api/src/domains/schema/wonder-schema.ts
import { Schema, type CustomTypeDefinition } from '@wonder/schemas';

export type JSONSchema = {
  type:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'artifact_ref'
    | 'workflow_ref'; // Custom types

  // Standard JSON Schema
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;

  // Wonder-specific metadata
  artifact_type_id?: string;
  workflow_def_id?: string;
};

// Helper to create ULID validator
function createULIDValidator() {
  return (value: unknown): boolean => {
    return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
  };
}

// Create schema with Wonder's custom types
export function createWonderSchema(schemaDefinition: Record<string, JSONSchema>): Schema {
  const schema = new Schema(schemaDefinition);

  // Register custom types
  schema.registerCustomType('artifact_ref', {
    validate: createULIDValidator(),
    sqlType: 'TEXT',
    sqlConstraints: ['CHECK(length(value) = 26)'],
  });

  schema.registerCustomType('workflow_ref', {
    validate: createULIDValidator(),
    sqlType: 'TEXT',
    sqlConstraints: ['CHECK(length(value) = 26)'],
  });

  return schema;
}

// Usage in execution service
export async function initializeWorkflowContext(workflowDef: WorkflowDef, input: unknown) {
  // Validate input
  const inputSchema = createWonderSchema(workflowDef.input_schema);
  inputSchema.validate(input);

  // Generate DDL for context storage
  const contextSchema = createWonderSchema(workflowDef.context_schema);
  const ddl = contextSchema.generateDDL('context');

  // Initialize DO storage
  await db.exec(ddl);
}
```

## Error Messages

Custom types provide clear error messages:

```typescript
// Type mismatch
{
  artifact_id: 123;
}
// → "Expected artifact_ref at .artifact_id, got number"

// Validation failure
{
  artifact_id: 'invalid-ulid';
}
// → "Invalid artifact_ref at .artifact_id"

// Missing required field
{
  count: 42;
}
// → "Missing required field artifact_id"
```

## Reusability Across Products

Other products can define their own custom types:

```typescript
// Product A
schema.registerCustomType('product_a_id', {
  validate: (val) => isProductAId(val),
  sqlType: 'TEXT',
});

// Product B
schema.registerCustomType('encrypted_string', {
  validate: (val) => typeof val === 'string',
  sqlType: 'BLOB',
  sqlConstraints: ['CHECK(length(value) > 0)'],
});
```

The library itself remains product-agnostic—applications define their domain types.

## Benefits

1. **Single definition**: Validation and SQL mapping in one place
2. **Explicit schemas**: Domain types are first-class citizens
3. **Type safety**: Custom types discriminate cleanly in TypeScript
4. **Unified API**: One registration point for both concerns
5. **Extensibility**: Applications extend without modifying the library

## Built-in Types

The schema library includes these standard types:

- `string` — Text data
- `number` — Floating point numbers
- `integer` — Whole numbers
- `boolean` — True/false values
- `object` — Nested objects
- `array` — Lists of items
- `null` — Null values

Custom types extend this set for domain-specific needs.
