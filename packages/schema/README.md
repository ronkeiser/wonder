# @wonder/schema

Runtime schema validation and DDL generation for Wonder workflows.

## Features

- ✅ **Runtime validation**: Fast interpretation-based validation (no compilation step)
- 🔧 **CF Workers compatible**: No eval, no code generation
- 🎨 **Custom types**: Extensible type system with validation + SQL mapping
- 📝 **Full constraints**: String, number, array constraints + enum, const, nullable
- ❌ **Rich errors**: JSON Pointer paths, collect all errors, detailed error codes
- 🗄️ **DDL generation**: Generate SQLite CREATE TABLE statements from schemas
- 🔗 **Unified package**: Single registration for validation and SQL concerns

## Installation

```bash
pnpm add @wonder/schema
```

## Usage

### Validation

```typescript
import { Validator, validateSchema } from '@wonder/schema';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0 },
    email: { type: 'string' },
  },
  required: ['name', 'email'],
};

// Exception-driven (throws on first error)
validateSchema(data, schema);

// Result-driven (collects all errors)
const validator = new Validator(schema, { collectAllErrors: true });
const result = validator.validate(data);

if (!result.valid) {
  result.errors.forEach((err) => {
    console.error(`${err.path}: ${err.message}`);
  });
}
```

### DDL Generation

```typescript
import { DDLGenerator, CustomTypeRegistry } from '@wonder/schema';

// Define schema
const schema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    email: { type: 'string' },
    status: { type: 'string', enum: ['active', 'inactive'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'name', 'email'],
};

// Generate DDL
const generator = new DDLGenerator(schema, new CustomTypeRegistry());
const ddl = generator.generateDDL('users');

console.log(ddl);
/* Output:
CREATE TABLE users (
  id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  email TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE users_tags (
  users_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  value TEXT,
  FOREIGN KEY (users_id) REFERENCES users(rowid)
);
*/
```

### Custom Types with SQL Mapping

```typescript
import { CustomTypeRegistry, Validator, DDLGenerator } from '@wonder/schema';

// Register custom type with validation and SQL mapping
const registry = new CustomTypeRegistry();
registry.register('timestamp', {
  validate: (value: unknown) => typeof value === 'number' && value > 0,
  toSQL: () => ({
    type: 'INTEGER',
    constraints: ['CHECK (value > 0)'],
  }),
});

// Use in validation
const schema = {
  type: 'object',
  properties: {
    createdAt: { type: 'timestamp' as any },
  },
};

const validator = new Validator(schema, registry);
const result = validator.validate({ createdAt: Date.now() });

// Use in DDL generation
const generator = new DDLGenerator(schema, registry);
const ddl = generator.generateDDL('events');
```

### DDL Generation Options

```typescript
// Flatten nested objects (default)
const generator = new DDLGenerator(schema, registry, {
  nestedObjectStrategy: 'flatten', // Creates user_name, user_email columns
});

// Store nested objects as JSON
const generator = new DDLGenerator(schema, registry, {
  nestedObjectStrategy: 'json', // Creates single TEXT column with JSON
});

// Arrays as separate tables (default)
const generator = new DDLGenerator(schema, registry, {
  arrayStrategy: 'table', // Creates posts_tags table with FK
});

// Arrays as JSON
const generator = new DDLGenerator(schema, registry, {
  arrayStrategy: 'json', // Creates single TEXT column with JSON array
});
```

## License

MIT - Incorporates code from:

- [Cabidela](https://github.com/cloudflare/cabidela) (MIT) © Cloudflare
- [@cfworker/json-schema](https://github.com/cfworker/cfworker) (MIT) © Jeremy Danyow
