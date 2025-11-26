# @wonder/validator Implementation Plan

## Overview

A hybrid JSON Schema validator combining the best of Cabidela (performance) and @cfworker/json-schema (completeness) for Wonder's workflow orchestration platform.

## Design Decisions

### Base: Cabidela Core

**Why Cabidela:**

- Optimized for CF Workers single-request validation (no compilation overhead)
- 200-1900x faster than Ajv in CF Workers environment
- Clean, readable codebase (~427 LOC core)
- Handles 95% of Wonder's validation needs out of the box

**Cabidela strengths we're keeping:**

- Runtime interpretation (no eval/code generation)
- Fast type checking and constraint validation
- Exception-driven validation (throws on first error)
- `oneOf`/`anyOf`/`allOf` support
- Default value application
- Custom error messages via `errorMessage` property
- `$ref` and `$defs` support

### Enhancements from @cfworker

**Format validation:**

- Email, hostname, IPv4, IPv6, URI, UUID, date, datetime, regex
- Wonder-specific: ULID format validator
- ~150 LOC of proven validation logic

**Result-based API:**

- Option to collect all validation errors (not just first)
- Returns `{ valid: boolean, errors: ValidationError[] }`
- Better for UI error display and debugging

**Rich error structure:**

```typescript
interface ValidationError {
  message: string;
  path: string; // JSON Pointer: "/user/email"
  code: string; // "TYPE_MISMATCH", "MIN_LENGTH", etc.
  keyword?: string; // Schema keyword that failed
  schemaPath?: string; // Path to failing schema rule
}
```

### Wonder-Specific Features

**1. Partial validation** (for DO context updates):

```typescript
// Only validate changed fields
validatePartial({ 'state.votes': [...newVotes] }, contextSchema, { basePath: 'state' });
```

**2. Strict mode option:**

```typescript
new Validator(schema, {
  strictMode: true, // Reject any properties not in schema
});
```

**3. artifact_ref type:**

```typescript
{
  type: 'artifact_ref',
  artifact_type_id: 'uuid-here'
}
// Validates string + format, can optionally check artifact exists
```

**4. Nullable support:**

```typescript
{
  type: 'string',
  nullable: true  // Allows string | null
}
```

## File Structure

```
packages/validator/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── docs/
│   ├── plan.md                 # This file
│   └── api.md                  # API documentation (TBD)
├── src/
│   ├── index.ts                # Public API exports
│   ├── types.ts                # TypeScript type definitions
│   ├── validator.ts            # Main Validator class
│   ├── validate.ts             # Core validation logic (from Cabidela)
│   ├── constraints.ts          # Type-specific constraint checking
│   ├── formats.ts              # Format validators (from @cfworker)
│   ├── errors.ts               # ValidationError class
│   ├── utils.ts                # JSON Pointer, metadata, etc.
│   └── partial.ts              # Partial validation logic
└── test/
    ├── validator.test.ts       # Core validation tests
    ├── formats.test.ts         # Format validation tests
    ├── constraints.test.ts     # Min/max/pattern tests
    ├── partial.test.ts         # Partial validation tests
    ├── errors.test.ts          # Error collection tests
    └── fixtures/
        └── schemas.ts          # Reusable test schemas
```

## API Design

### Exception-Driven (Simple Cases)

```typescript
import { validateSchema } from '@wonder/validator';

// Throws ValidationError on failure
validateSchema(data, schema);
```

### Result-Driven (All Errors)

```typescript
import { Validator } from '@wonder/validator';

const validator = new Validator(schema, {
  collectAllErrors: true,
  strictMode: true,
  applyDefaults: false,
});

const result = validator.validate(data);
// { valid: boolean, errors: ValidationError[] }
```

### Partial Validation

```typescript
import { validatePartial } from '@wonder/validator';

// Validate only specific paths
validatePartial(updates, schema, {
  basePath: 'state',
  allowPartial: true,
});
```

### Format Validation

```typescript
const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    id: { type: 'string', format: 'ulid' },
    url: { type: 'string', format: 'url' },
    created: { type: 'string', format: 'date-time' },
  },
};
```

## Schema Type Definition

Enhanced from Wonder's current `SchemaType`:

```typescript
export type SchemaType = {
  // Core type
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'artifact_ref';

  // Nullability
  nullable?: boolean;

  // Object
  properties?: Record<string, SchemaType>;
  required?: string[];
  additionalProperties?: boolean | SchemaType;
  minProperties?: number;
  maxProperties?: number;

  // Array
  items?: SchemaType;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string; // regex
  format?: 'email' | 'url' | 'uuid' | 'ulid' | 'date' | 'date-time' | 'hostname' | 'ipv4' | 'ipv6';

  // Number/Integer
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Enum
  enum?: unknown[];
  const?: unknown;

  // Composition
  oneOf?: SchemaType[];
  anyOf?: SchemaType[];
  allOf?: SchemaType[];
  not?: SchemaType;

  // References
  $ref?: string;
  $defs?: Record<string, SchemaType>;

  // Defaults & metadata
  default?: unknown;
  title?: string;
  description?: string;
  errorMessage?: string; // Custom error message

  // Wonder-specific
  artifact_type_id?: string; // For artifact_ref type
};
```

## Implementation Phases

### Phase 1: Core Foundation (4-6 hours)

- [ ] Set up package structure
- [ ] Port Cabidela's core validation logic
- [ ] Adapt to Wonder's `SchemaType` definition
- [ ] Basic type checking (string, number, boolean, object, array)
- [ ] Constraint validation (min/max, length, pattern)
- [ ] Exception-driven API
- [ ] Basic test suite (50+ tests)

### Phase 2: Enhanced Errors (2 hours)

- [ ] `ValidationError` class with rich metadata
- [ ] Result-driven API (`collectAllErrors` option)
- [ ] Error path tracking (JSON Pointer)
- [ ] Schema path tracking
- [ ] Test error collection

### Phase 3: Format Validation (2 hours)

- [ ] Port @cfworker format validators
- [ ] Add ULID validator
- [ ] Integrate into validation flow
- [ ] Format validation tests

### Phase 4: Wonder-Specific (3 hours)

- [ ] Partial validation implementation
- [ ] Strict mode option
- [ ] `artifact_ref` type support
- [ ] `nullable` support
- [ ] Integration tests with Wonder schemas

### Phase 5: Documentation & Polish (2 hours)

- [ ] API documentation
- [ ] Usage examples
- [ ] Migration guide from current validator
- [ ] Performance benchmarks

**Total estimated time: 13-15 hours**

## Missing Cabidela Features

We're **NOT** adding these initially (can add later if needed):

1. **Multiple types**: `{ type: ["string", "number"] }`

   - Workaround: Use `oneOf`
   - Complexity: Easy (~50 LOC)

2. **Pattern properties**: Dynamic property key validation

   - Wonder doesn't need this (explicit schemas)
   - Complexity: Medium (~100 LOC)

3. **dependentRequired**: Conditional field requirements

   - Can validate in application logic
   - Complexity: Easy (~30 LOC)

4. **dependentSchemas**: Conditional schema application

   - Workaround: Use `oneOf`
   - Complexity: Medium (~80 LOC)

5. **if-then-else**: Conditional validation
   - Wonder uses explicit workflow logic
   - Complexity: Medium (~100 LOC)

## Migration from Current Validator

### Before (current implementation):

```typescript
import { validateSchema } from '~/domains/schema/validation';

validateSchema(input, workflowDef.input_schema);
```

### After (@wonder/validator):

```typescript
import { validateSchema } from '@wonder/validator';

validateSchema(input, workflowDef.input_schema);
```

**Breaking changes:**

1. Root-level fields no longer universally required (use `required` array)
2. Richer error messages with paths
3. New `nullable` and `format` support

## Testing Strategy

### Unit Tests

- Type validation (string, number, boolean, etc.)
- Constraint validation (min/max, length, pattern, etc.)
- Object validation (properties, required, additionalProperties)
- Array validation (items, minItems, uniqueItems)
- Composition (oneOf, anyOf, allOf, not)
- Format validation (email, uuid, ulid, etc.)
- Error handling (single error vs all errors)
- Partial validation

### Integration Tests

- Real Wonder workflow schemas
- Context validation
- Artifact type schemas
- Action configuration schemas

### Performance Tests

- Large schemas (100+ fields)
- Deep nesting (5+ levels)
- Large arrays (1000+ items)
- Compare against current implementation

## Success Criteria

1. ✅ **Correctness**: Passes all tests (200+ assertions)
2. ✅ **Performance**: Comparable or better than current implementation
3. ✅ **API compatibility**: Drop-in replacement for current validator
4. ✅ **CF Workers compatible**: No eval, no issues in miniflare
5. ✅ **Developer experience**: Better error messages, TypeScript support
6. ✅ **Maintainability**: Well-structured, documented, tested code

## License & Attribution

MIT License

Incorporates code from:

- **Cabidela** (MIT) © Cloudflare, Inc.
  - Core validation logic
  - Schema traversal
  - Type checking
- **@cfworker/json-schema** (MIT) © Jeremy Danyow
  - Format validators
  - Error collection patterns
  - Type definitions

Both licenses permit modification and redistribution with attribution.

## Next Steps

1. Review this plan for alignment with Wonder's needs
2. Implement Phase 1 (core foundation)
3. Run tests against existing Wonder schemas
4. Iterate based on real-world usage
5. Replace current validator in Wonder codebase
