# Wonder API Integration Example

This document shows how the Wonder API would use `@wonder/schemas` to validate workflow context data.

## 1. Define Custom Types in Wonder API

```typescript
// services/api/src/domains/schema/custom-types.ts
import { CustomTypeRegistry } from '@wonder/schemas';

export function createWonderRegistry(): CustomTypeRegistry {
  const registry = new CustomTypeRegistry();

  // Register artifact_ref type (ULID format)
  registry.register('artifact_ref', {
    validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
    toSQL: () => 'TEXT',
  });

  // Register workflow_ref type (ULID format)
  registry.register('workflow_ref', {
    validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
    toSQL: () => 'TEXT',
  });

  return registry;
}
```

## 2. Import JSONSchema in Wonder's Type Definitions

```typescript
// docs/architecture/primitives.ts
import type { JSONSchema } from '@wonder/schemas';

export type WorkflowContext = {
  input: Record<string, unknown>;
  state: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  version: string;
  // Schemas define the shape of each context field
  input_schema: JSONSchema;
  state_schema: JSONSchema;
  output_schema: JSONSchema;
  steps: WorkflowStep[];
};
```

## 3. Validate Context Data in Wonder API

```typescript
// services/api/src/domains/schema/validation.ts
import { Validator, validateSchema, type JSONSchema } from '@wonder/schemas';
import { createWonderRegistry } from './custom-types.js';

// Create singleton registry
const registry = createWonderRegistry();

/**
 * Validates workflow context data against schemas
 */
export function validateWorkflowContext(
  input: unknown,
  state: unknown,
  output: unknown,
  inputSchema: JSONSchema,
  stateSchema: JSONSchema,
  outputSchema: JSONSchema,
) {
  const errors = [];

  // Validate each field
  const inputResult = validateSchema(input, inputSchema, registry);
  if (!inputResult.valid) {
    errors.push({ field: 'input', errors: inputResult.errors });
  }

  const stateResult = validateSchema(state, stateSchema, registry);
  if (!stateResult.valid) {
    errors.push({ field: 'state', errors: stateResult.errors });
  }

  const outputResult = validateSchema(output, outputSchema, registry);
  if (!outputResult.valid) {
    errors.push({ field: 'output', errors: outputResult.errors });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## 4. Example Workflow Definition with Schemas

```typescript
// Example workflow using custom types
const imageProcessingWorkflow: WorkflowDefinition = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  name: 'Image Processing Pipeline',
  version: '1.0.0',

  // Input expects an artifact reference and configuration
  input_schema: {
    type: 'object',
    properties: {
      image_artifact: { type: 'artifact_ref' }, // Custom type!
      quality: { type: 'integer', minimum: 1, maximum: 100 },
      format: { type: 'string', enum: ['jpeg', 'png', 'webp'] },
    },
    required: ['image_artifact', 'format'],
  },

  // State tracks processing progress
  state_schema: {
    type: 'object',
    properties: {
      step: { type: 'string' },
      progress: { type: 'number', minimum: 0, maximum: 100 },
      temp_artifacts: {
        type: 'array',
        items: { type: 'artifact_ref' }, // Array of custom type!
      },
    },
    required: ['step', 'progress'],
  },

  // Output produces processed artifact
  output_schema: {
    type: 'object',
    properties: {
      processed_artifact: { type: 'artifact_ref' }, // Custom type!
      size_bytes: { type: 'integer', minimum: 0 },
      dimensions: {
        type: 'object',
        properties: {
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
        },
        required: ['width', 'height'],
      },
    },
    required: ['processed_artifact', 'size_bytes'],
  },

  steps: [
    /* ... */
  ],
};
```

## 5. Validation at Runtime

```typescript
// Example: Validating input when workflow starts
const input = {
  image_artifact: '01ARZ3NDEKTSV4RRFFQ69G5FAV', // Valid ULID
  quality: 85,
  format: 'webp',
};

const result = validateSchema(input, imageProcessingWorkflow.input_schema, registry);

if (!result.valid) {
  console.error('Invalid input:', result.errors);
  // [
  //   {
  //     path: '/image_artifact',
  //     message: 'Custom type validation failed',
  //     code: 'CUSTOM_TYPE_INVALID',
  //   }
  // ]
} else {
  // Proceed with workflow execution
  console.log('Input valid, starting workflow...');
}
```

## Key Design Points

1. **@wonder/schemas is standalone**:
   - Defines `JSONSchema` and all validation logic
   - Has zero knowledge of Wonder-specific types
   - Works in any Cloudflare Workers environment

2. **Wonder API is a consumer**:
   - Imports `JSONSchema` from `@wonder/schemas`
   - Registers custom types (`artifact_ref`, `workflow_ref`) at runtime
   - Uses the library's validators for context validation

3. **Wonder's domain constraint**:
   - Context fields (input, state, output) are always objects with keyed values
   - Wonder wraps schemas as: `{ type: 'object', properties: {...}, required: [...] }`
   - The library's flexibility (accepting any JSONSchema) allows this without artificial constraints

4. **Validation happens at the API layer**:
   - Before storing context in SQLite/DO
   - When workflows start/resume
   - When effects produce output
   - Errors are reported with JSON Pointer paths for precise error location
