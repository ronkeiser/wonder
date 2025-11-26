# @wonder/schema Implementation Plan

## Overview

Build `@wonder/schema` as a combined validation and DDL generation library for runtime schemas. This replaces the original plan to build separate validator and DDL packages.

**Key Decision:** Custom type extensions (not format-based) for explicit domain types that work across both validation and SQL generation.

## Package Rename

- **Current:** `@wonder/validator`
- **New:** `@wonder/schema`
- Reflects broader scope: validation + DDL generation + query helpers

## Design Decisions

### Architecture: Runtime Interpretation

**Why no code generation/compilation:**

Following Cabidela's approach, we use **runtime interpretation** rather than code generation:

- **No eval()** - Critical for Cloudflare Workers security model
- **No compilation overhead** - Validation happens immediately without pre-processing
- **Simpler debugging** - Stack traces point to validation logic, not generated code
- **Smaller bundle** - No code generation runtime needed

**Performance characteristics:**

- Cabidela is 200-1900x faster than Ajv in CF Workers because it avoids compilation
- Runtime interpretation is fast enough for single-request validation
- Schema caching in memory (already parsed objects) provides additional speedup

### Validation Strategy: Collect All Errors

Unlike fail-fast validators, we **collect all validation errors** before returning:

```typescript
// Not this:
function validate(data) {
  if (typeof data.name !== 'string') throw new Error('Invalid name');
  if (typeof data.age !== 'number') throw new Error('Invalid age');
  // Only see first error
}

// This:
function validate(data) {
  const errors = [];
  if (typeof data.name !== 'string') errors.push({ path: '/name', ... });
  if (typeof data.age !== 'number') errors.push({ path: '/age', ... });
  return { valid: errors.length === 0, errors };
  // See all errors at once
}
```

**Benefits:**

- Better debugging (see all issues, not just first)
- Better UX (fix multiple issues in one pass)
- Wonder's workflow validation shows all input errors

### Error Reporting: JSON Pointer Paths

Use **RFC 6901 JSON Pointer** format for error paths:

```typescript
// Data
{
  user: {
    addresses: [
      { city: 123 }, // Wrong type
    ];
  }
}

// Error path
('/user/addresses/0/city');
```

**Why JSON Pointer:**

- Standard format (RFC 6901)
- Unambiguous (handles arrays, special chars)
- Parseable (can navigate to error location programmatically)
- Common in JSON Schema validators

### Custom Types vs Formats

**Why custom types instead of format-based:**

```typescript
// Custom type approach (chosen)
{ type: 'artifact_ref' }

// Format approach (rejected)
{ type: 'string', format: 'ulid', _ref_type: 'artifact' }
```

**Reasons:**

1. **Explicit schemas** - Type name communicates domain meaning directly
2. **Single registration** - Define validation + SQL mapping together
3. **Better errors** - "Expected artifact_ref" vs "Expected string with format 'ulid'"
4. **TypeScript discrimination** - `schema.type === 'artifact_ref'` works naturally
5. **SQL integration** - Custom types map to SQL types in one definition

### Combined Package: Validation + DDL

**Why not separate packages:**

Since custom types need both validation logic AND SQL mapping:

```typescript
// If separate packages, you'd register twice:
validatorTypes.register('artifact_ref', { validate: ... });
ddlTypes.register('artifact_ref', { sqlType: 'TEXT' });

// Combined package, register once:
schema.registerCustomType('artifact_ref', {
  validate: ...,
  sqlType: 'TEXT'
});
```

**Benefits:**

- Single source of truth for type definitions
- Guaranteed consistency between validation and SQL
- Simpler API for consumers
- Natural fit for Wonder's use case (validate then store)

## File Structure

```
packages/schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── docs/
│   ├── new-plan.md              # This file
│   ├── custom-types.md          # Custom type extension guide
│   └── api.md                   # API documentation (TBD)
├── src/
│   ├── index.ts                 # Public API exports
│   ├── types.ts                 # TypeScript type definitions
│   ├── validator.ts             # Validator class
│   ├── validate.ts              # Core recursive validation logic
│   ├── constraints.ts           # Type-specific constraint checking
│   ├── custom-types.ts          # CustomTypeRegistry class
│   ├── ddl-generator.ts         # DDL generation logic
│   ├── errors.ts                # ValidationError class
│   └── utils.ts                 # JSON Pointer, path utilities
└── test/
    ├── validator.test.ts        # Core validation tests
    ├── constraints.test.ts      # Constraint validation tests
    ├── custom-types.test.ts     # Custom type tests
    ├── ddl-generator.test.ts    # DDL generation tests
    ├── integration.test.ts      # End-to-end tests
    └── fixtures/
        └── schemas.ts           # Test schema definitions
```

## Phase 1: Core Validator

**Goal:** Runtime schema validation with custom type support

### 1.1 Type Definitions

```typescript
// src/types.ts

// Core schema type definition
export type SchemaType = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

  // Object validation
  properties?: Record<string, SchemaType>;
  required?: string[];

  // Array validation
  items?: SchemaType;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string; // Regex pattern

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array constraints
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // General constraints
  enum?: unknown[];
  const?: unknown;

  // Composition (Phase 1.5+)
  nullable?: boolean;

  // Metadata
  description?: string;
  default?: unknown;
};

// Custom type definition (for extensibility)
export type CustomTypeDefinition = {
  // Validation function - returns true if valid
  validate: (value: unknown, schema: SchemaType, path: string) => boolean;

  // Optional metadata
  description?: string;
  examples?: unknown[];
};

// Validation result - collects all errors
export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  data?: unknown; // Validated data (possibly with defaults applied)
};

// Rich error information
export type ValidationError = {
  path: string; // JSON Pointer (e.g., "/user/addresses/0/city")
  message: string; // Human-readable error message
  code: ValidationErrorCode; // Machine-readable error code
  expected?: string; // Expected type/value
  actual?: string; // Actual type/value received
  keyword?: string; // Schema keyword that failed (minLength, pattern, etc.)
};

// Error codes for programmatic error handling
export enum ValidationErrorCode {
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  MIN_LENGTH = 'MIN_LENGTH',
  MAX_LENGTH = 'MAX_LENGTH',
  PATTERN_MISMATCH = 'PATTERN_MISMATCH',
  MINIMUM = 'MINIMUM',
  MAXIMUM = 'MAXIMUM',
  EXCLUSIVE_MINIMUM = 'EXCLUSIVE_MINIMUM',
  EXCLUSIVE_MAXIMUM = 'EXCLUSIVE_MAXIMUM',
  MULTIPLE_OF = 'MULTIPLE_OF',
  MIN_ITEMS = 'MIN_ITEMS',
  MAX_ITEMS = 'MAX_ITEMS',
  UNIQUE_ITEMS = 'UNIQUE_ITEMS',
  ENUM_MISMATCH = 'ENUM_MISMATCH',
  CONST_MISMATCH = 'CONST_MISMATCH',
  CUSTOM_TYPE_INVALID = 'CUSTOM_TYPE_INVALID',
}

// Validator options
export type ValidatorOptions = {
  // Collect all errors (true) or fail on first error (false)
  collectAllErrors?: boolean; // default: true

  // Apply default values from schema
  applyDefaults?: boolean; // default: false

  // Allow null for nullable types
  strictNullChecks?: boolean; // default: true
};
```

### 1.2 Custom Type Registry

```typescript
// src/custom-types.ts

export class CustomTypeRegistry {
  private types = new Map<string, CustomTypeDefinition>();

  register(name: string, definition: CustomTypeDefinition): void {
    if (this.types.has(name)) {
      throw new Error(`Custom type '${name}' is already registered`);
    }
    this.types.set(name, definition);
  }

  get(name: string): CustomTypeDefinition | undefined {
    return this.types.get(name);
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  getAll(): Map<string, CustomTypeDefinition> {
    return new Map(this.types); // Return copy for immutability
  }
}
```

### 1.3 Core Validator

```typescript
// src/validator.ts

export class Validator {
  constructor(
    private schema: Record<string, SchemaType>,
    private customTypes: CustomTypeRegistry,
    private options: ValidatorOptions = {},
  ) {
    this.options = {
      collectAllErrors: true,
      applyDefaults: false,
      strictNullChecks: true,
      ...options,
    };
  }

  // Main validation entry point
  validate(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate each root property
    for (const [key, propSchema] of Object.entries(this.schema)) {
      const value = (data as any)?.[key];
      const path = `/${key}`;

      // Check required fields
      if (value === undefined && this.schema.required?.includes(key)) {
        errors.push({
          path,
          message: `Required field '${key}' is missing`,
          code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
          expected: 'value',
          actual: 'undefined',
        });
        continue;
      }

      // Skip optional fields
      if (value === undefined) continue;

      // Validate value against schema
      const valueErrors = this.validateValue(value, propSchema, path);
      errors.push(...valueErrors);

      // Stop on first error if not collecting all
      if (!this.options.collectAllErrors && errors.length > 0) {
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: this.options.applyDefaults ? this.applyDefaults(data) : data,
    };
  }

  // Recursive value validation
  private validateValue(value: unknown, schema: SchemaType, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Handle nullable
    if (value === null) {
      if (schema.nullable) {
        return []; // null is valid
      }
      errors.push({
        path,
        message: `Expected ${schema.type}, got null`,
        code: ValidationErrorCode.TYPE_MISMATCH,
        expected: schema.type,
        actual: 'null',
      });
      return errors;
    }

    // Check if custom type
    if (this.customTypes.has(schema.type)) {
      return this.validateCustomType(value, schema, path);
    }

    // Validate by type
    switch (schema.type) {
      case 'string':
        return this.validateString(value, schema, path);
      case 'number':
        return this.validateNumber(value, schema, path);
      case 'integer':
        return this.validateInteger(value, schema, path);
      case 'boolean':
        return this.validateBoolean(value, schema, path);
      case 'object':
        return this.validateObject(value, schema, path);
      case 'array':
        return this.validateArray(value, schema, path);
      case 'null':
        return this.validateNull(value, schema, path);
      default:
        errors.push({
          path,
          message: `Unknown type '${schema.type}'`,
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'valid type',
          actual: schema.type,
        });
    }

    return errors;
  }

  // Type-specific validators (see constraints.ts for implementation)
  private validateString(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateNumber(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateInteger(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateBoolean(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateObject(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateArray(value: unknown, schema: SchemaType, path: string): ValidationError[];
  private validateNull(value: unknown, schema: SchemaType, path: string): ValidationError[];

  // Custom type validation
  private validateCustomType(value: unknown, schema: SchemaType, path: string): ValidationError[] {
    const customType = this.customTypes.get(schema.type);
    if (!customType) {
      return [
        {
          path,
          message: `Custom type '${schema.type}' not registered`,
          code: ValidationErrorCode.TYPE_MISMATCH,
          expected: 'registered custom type',
          actual: schema.type,
        },
      ];
    }

    const isValid = customType.validate(value, schema, path);
    if (!isValid) {
      return [
        {
          path,
          message: `Invalid ${schema.type} at ${path}`,
          code: ValidationErrorCode.CUSTOM_TYPE_INVALID,
          expected: schema.type,
          actual: typeof value,
        },
      ];
    }

    return [];
  }

  // Apply default values (if enabled)
  private applyDefaults(data: unknown): unknown {
    // Implementation: recursively apply defaults from schema
    // Only Phase 1.5+ if needed
  }
}
```

**Implementation in `src/constraints.ts`:**

Type-specific validators with full constraint checking (minLength, maxLength, pattern, min, max, exclusiveMin/Max, multipleOf, minItems, maxItems, uniqueItems, enum, const).

**Features:**

- ✅ Basic type validation (string, number, integer, boolean, object, array, null)
- ✅ Nested object validation with required fields
- ✅ Array validation with items schema
- ✅ Custom type support via registry
- ✅ Rich error messages with JSON Pointer paths
- ✅ Collect all errors (configurable via options)
- ✅ Full constraint validation:
  - String: minLength, maxLength, pattern
  - Number: minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf
  - Array: minItems, maxItems, uniqueItems
  - General: enum, const
- ✅ Nullable support
- ✅ Options: collectAllErrors, applyDefaults, strictNullChecks

### 1.4 Constraints Implementation

```typescript
// src/constraints.ts

// String validation with constraints
export function validateString(
  value: unknown,
  schema: SchemaType,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: `Expected string at ${path}, got ${typeof value}`,
      code: ValidationErrorCode.TYPE_MISMATCH,
      expected: 'string',
      actual: typeof value,
    });
    return errors;
  }

  // minLength
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      path,
      message: `String length ${value.length} is less than minimum ${schema.minLength}`,
      code: ValidationErrorCode.MIN_LENGTH,
      keyword: 'minLength',
    });
  }

  // maxLength
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      path,
      message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
      code: ValidationErrorCode.MAX_LENGTH,
      keyword: 'maxLength',
    });
  }

  // pattern
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push({
        path,
        message: `String does not match pattern ${schema.pattern}`,
        code: ValidationErrorCode.PATTERN_MISMATCH,
        keyword: 'pattern',
      });
    }
  }

  // enum
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      path,
      message: `Value '${value}' is not in allowed values: ${schema.enum.join(', ')}`,
      code: ValidationErrorCode.ENUM_MISMATCH,
      keyword: 'enum',
    });
  }

  // const
  if (schema.const !== undefined && value !== schema.const) {
    errors.push({
      path,
      message: `Value must be exactly '${schema.const}'`,
      code: ValidationErrorCode.CONST_MISMATCH,
      keyword: 'const',
    });
  }

  return errors;
}

// Similar implementations for:
// - validateNumber (minimum, maximum, exclusiveMin/Max, multipleOf, enum, const)
// - validateInteger (same as number + integer check)
// - validateBoolean (type check only, enum, const)
// - validateArray (items, minItems, maxItems, uniqueItems)
// - validateObject (properties, required, nested recursion)
// - validateNull (type check only)
```

### 1.5 Testing

**Test coverage:**

- ✅ Basic type validation for all types
- ✅ Custom type registration and validation
- ✅ Error message format and JSON Pointer paths
- ✅ Nested object/array validation
- ✅ All constraint types:
  - String constraints (minLength, maxLength, pattern)
  - Number constraints (min, max, exclusiveMin/Max, multipleOf)
  - Array constraints (minItems, maxItems, uniqueItems)
  - General constraints (enum, const)
- ✅ Nullable handling
- ✅ Required field validation
- ✅ Collect all errors vs fail-fast
- ✅ Options (collectAllErrors, strictNullChecks)

**Test files:**

- `validator.test.ts` - Core validation logic
- `constraints.test.ts` - All constraint types
- `custom-types.test.ts` - Custom type extension
- `errors.test.ts` - Error format and paths

**Deliverable:** Robust validator with comprehensive constraint support, ready for Wonder integration

---

## Phase 2: DDL Generation

**Goal:** Generate SQLite DDL from schemas

### 2.1 Extend Custom Type Definition

```typescript
type CustomTypeDefinition = {
  // Validation (from Phase 1)
  validate: (value: unknown, schema: SchemaType, path: string) => boolean;

  // SQL mapping (new)
  sqlType: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
  sqlConstraints?: string[];

  // Metadata
  description?: string;
  examples?: unknown[];
};
```

### 2.2 DDL Generator

```typescript
class DDLGenerator {
  constructor(private schema: Record<string, SchemaType>, private customTypes: CustomTypeRegistry);

  // Generate CREATE TABLE statements
  generateDDL(tableName: string): string;

  // Map schema to columns
  private generateColumns(schema: Record<string, SchemaType>): ColumnDefinition[];

  // Map arrays to separate tables
  private generateArrayTables(tableName: string, schema: Record<string, SchemaType>): string[];

  // Type mapping
  private mapTypeToSQL(schema: SchemaType): string;
}
```

**Features:**

- ✅ Scalar fields → columns
- ✅ Arrays → separate tables with foreign keys
- ✅ Nested objects → flattened columns or JSON
- ✅ Custom types → SQL types via registry
- ✅ NOT NULL constraints for required fields
- ✅ CHECK constraints from custom types
- ✅ Primary keys and indexes

### 2.3 Testing

- DDL generation for simple schemas
- Array table generation
- Custom type SQL mapping
- Constraint generation

**Deliverable:** DDL generator that creates SQLite tables from Wonder schemas

---

## Phase 3: Integration & Migration

**Goal:** Integrate into Wonder API and migrate existing schemas

### 3.1 Wonder Custom Types

```typescript
// services/api/src/domains/schema/wonder-types.ts

export function registerWonderTypes(registry: CustomTypeRegistry): void {
  // artifact_ref
  registry.register('artifact_ref', {
    validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
    sqlType: 'TEXT',
    sqlConstraints: ['CHECK(length(value) = 26)'],
    description: 'Reference to an artifact by ULID',
  });

  // workflow_ref
  registry.register('workflow_ref', {
    validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
    sqlType: 'TEXT',
    sqlConstraints: ['CHECK(length(value) = 26)'],
    description: 'Reference to a workflow definition by ULID',
  });
}
```

### 3.2 Replace Current Validator

- Update `services/api/src/domains/schema/validation.ts`
- Replace inline validator with `@wonder/schema`
- Ensure error messages match or improve current format

### 3.3 Schema Migration

- Add `required` arrays to existing schemas (backward compatible)
- Update `primitives.ts` type definitions
- Test against existing workflow definitions

### 3.4 Testing

- Integration tests with real Wonder schemas
- Validate against execution service fixtures
- Ensure DO context initialization works

**Deliverable:** `@wonder/schema` integrated into Wonder API with all tests passing

---

## Phase 4: Query Helpers (Optional)

**Goal:** Simple query builders for common operations

```typescript
class Schema {
  // ... validation and DDL methods ...

  // Query helpers
  insert(db: Database, table: string, data: Record<string, unknown>): Promise<void>;
  update(
    db: Database,
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>,
  ): Promise<void>;
  select(db: Database, table: string, where?: Record<string, unknown>): Promise<unknown[]>;
}
```

**Note:** May defer this phase if raw SQL is sufficient for Wonder's needs.

---

## API Examples

### Simple Usage (Exception-Driven)

```typescript
import { validateSchema } from '@wonder/schema';

const schema = {
  name: { type: 'string', minLength: 1 },
  age: { type: 'integer', minimum: 0, maximum: 120 },
};

// Throws ValidationError on failure
validateSchema(data, schema);
```

### Advanced Usage (Result-Driven)

```typescript
import { Validator, CustomTypeRegistry } from '@wonder/schema';

const registry = new CustomTypeRegistry();
registry.register('artifact_ref', {
  validate: (value) => typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value),
});

const validator = new Validator(schema, registry, {
  collectAllErrors: true,
  strictNullChecks: true,
});

const result = validator.validate(data);
if (!result.valid) {
  console.error('Validation failed:', result.errors);
}
```

---

## Implementation Order

### Step 1: Validator Only (Phase 1)

- Implement core validation with custom type support
- Test thoroughly with Wonder schemas
- **Checkpoint:** Can validate all existing Wonder schemas

### Step 2: DDL Generation (Phase 2)

- Add SQL mapping to custom types
- Implement DDL generator
- Test DDL generation independently
- **Checkpoint:** Can generate valid SQLite DDL from schemas

### Step 3: Integration (Phase 3)

- Replace current validator in API
- Test end-to-end with DO context storage
- **Checkpoint:** Wonder execution service uses new schema package

### Step 4: Query Helpers (Phase 4 - Optional)

- Add convenience methods if needed
- **Checkpoint:** Complete ORM-like functionality

---

## Feature Implementation Status

| Feature                                               | Phase 1-3 (Immediate) | Future Enhancement |
| ----------------------------------------------------- | :-------------------: | :----------------: |
| **Basic Types**                                       |
| string, number, integer, boolean, object, array, null |          ✅           |                    |
| **String Constraints**                                |
| minLength, maxLength                                  |          ✅           |                    |
| pattern (regex)                                       |          ✅           |                    |
| format (email, url, uuid, date-time, etc.)            |                       |    ⏭️ Phase 1.5    |
| **Number Constraints**                                |
| minimum, maximum                                      |          ✅           |                    |
| exclusiveMinimum, exclusiveMaximum                    |          ✅           |                    |
| multipleOf                                            |          ✅           |                    |
| **Array Constraints**                                 |
| items (type validation)                               |          ✅           |                    |
| minItems, maxItems                                    |          ✅           |                    |
| uniqueItems                                           |          ✅           |                    |
| **Object Constraints**                                |
| properties, required                                  |          ✅           |                    |
| additionalProperties (strict mode)                    |                       |    ⏭️ Phase 1.5    |
| minProperties, maxProperties                          |                       |    ⏭️ Phase 1.5    |
| **General Constraints**                               |
| enum                                                  |          ✅           |                    |
| const                                                 |          ✅           |                    |
| **Type Modifiers**                                    |
| nullable                                              |          ✅           |                    |
| default (value application)                           |                       |    ⏭️ Phase 1.5    |
| **Composition**                                       |
| oneOf, anyOf, allOf, not                              |                       |    ⏭️ Phase 1.5    |
| **References**                                        |
| $ref, $defs                                           |                       |    ⏭️ Phase 1.5    |
| **Custom Types**                                      |
| Custom type registry                                  |          ✅           |                    |
| Custom type validation                                |          ✅           |                    |
| Custom type SQL mapping                               |          ✅           |                    |
| **Error Handling**                                    |
| JSON Pointer paths                                    |          ✅           |                    |
| Collect all errors                                    |          ✅           |                    |
| Rich error codes                                      |          ✅           |                    |
| Custom error messages (errorMessage)                  |                       |    ⏭️ Phase 1.5    |
| **Options**                                           |
| collectAllErrors                                      |          ✅           |                    |
| strictNullChecks                                      |          ✅           |                    |
| applyDefaults                                         |                       |    ⏭️ Phase 1.5    |
| **DDL Generation**                                    |
| Schema → CREATE TABLE                                 |          ✅           |                    |
| Scalar fields → columns                               |          ✅           |                    |
| Arrays → separate tables                              |          ✅           |                    |
| Custom types → SQL types                              |          ✅           |                    |
| NOT NULL constraints                                  |          ✅           |                    |
| CHECK constraints                                     |          ✅           |                    |
| Indexes                                               |                       |    ⏭️ Phase 2.5    |
| Foreign keys                                          |                       |    ⏭️ Phase 2.5    |
| **Query Helpers**                                     |
| INSERT/UPDATE/SELECT                                  |                       |     ⏭️ Phase 4     |
| WHERE clause builder                                  |                       |    ⏭️ Phase 3.5    |
| JOINs                                                 |                       |    ⏭️ Phase 3.5    |
| **Other**                                             |
| Partial validation                                    |                       |    ⏭️ Phase 1.5    |
| Schema versioning                                     |                       |    🔮 Long-term    |
| Migration generation                                  |                       |    🔮 Long-term    |

## Success Criteria

- ✅ Drop-in replacement for current validator
- ✅ Zero breaking changes to existing Wonder schemas
- ✅ Better error messages (JSON Pointer paths, collect all errors)
- ✅ Custom type support for `artifact_ref`, `workflow_ref`
- ✅ DDL generation for DO context storage
- ✅ All existing tests pass
- ✅ Clear migration path for future schema changes

---

## Future Enhancements (Post-Initial Implementation)

### Phase 1.5: Enhanced Validation

- oneOf/anyOf/allOf/not support (schema composition)
- $ref and $defs support (schema references)
- additionalProperties / strict mode (reject unexpected properties)
- Default value application
- Custom error messages per field (`errorMessage` property)
- Partial validation (validate subset of schema)

### Phase 2.5: Enhanced DDL

- Index generation hints
- Foreign key relationships
- Migration generation
- Schema diffing

### Phase 3.5: Query Builder

- WHERE clause builder with type safety
- JOIN support for array tables
- Aggregate functions
- Transactions
- Batch operations

### Long-term

- Schema versioning and migrations
- Performance optimizations (schema compilation/caching)
- Format validators (email, url, uuid, date-time)
- Streaming validation for large payloads
