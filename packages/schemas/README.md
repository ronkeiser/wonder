# @wonder/context

Complete schema-driven SQL toolkit: validation, DDL generation, and DML generation for SQLite/D1.

## Features

- ✅ **Runtime validation**: Fast interpretation-based validation (no compilation step)
- 🔧 **CF Workers compatible**: No eval, no code generation - perfect for Cloudflare Workers & D1
- 🎨 **Custom types**: Extensible type system with validation + SQL mapping
- 📝 **Full constraints**: String, number, array constraints + enum, const, nullable
- ❌ **Rich errors**: JSON Pointer paths, collect all errors, detailed error codes
- 🗄️ **DDL generation**: Generate SQLite CREATE TABLE statements from schemas
- 💾 **DML generation**: Generate INSERT, UPDATE, DELETE statements with proper parameterization
- 🎲 **Mock data generation**: Generate random data conforming to schemas (for testing)
- 🔗 **Unified package**: Single schema definition drives validation, DDL, DML, and mocks

## Installation

```bash
pnpm add @wonder/context
```

## Quick Start

```typescript
import { Validator, DDLGenerator, DMLGenerator, CustomTypeRegistry } from '@wonder/schemas';

// 1. Define your schema once
const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    username: { type: 'string', minLength: 3, maxLength: 20 },
    email: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'username', 'email'],
};

const registry = new CustomTypeRegistry();

// 2. Generate tables (DDL)
const ddlGen = new DDLGenerator(userSchema, registry);
const createTable = ddlGen.generateDDL('users');

// 3. Validate data
const validator = new Validator(userSchema, registry);
const result = validator.validate({ id: 1, username: 'alice', email: 'alice@example.com' });

// 4. Generate queries (DML)
const dmlGen = new DMLGenerator(userSchema, registry);
const { statements, values } = dmlGen.generateInsert('users', {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  tags: ['developer', 'typescript'],
});

// Execute with D1:
await db
  .prepare(statements[0])
  .bind(...values[0])
  .run();
```

## Usage

### Validation

```typescript
import { Validator, validateSchema } from '@wonder/schemas';

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
import { DDLGenerator, CustomTypeRegistry } from '@wonder/schemas';

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
import { CustomTypeRegistry, Validator, DDLGenerator } from '@wonder/schemas';

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

### DML Generation (INSERT/UPDATE/DELETE)

```typescript
import { DMLGenerator } from '@wonder/schemas';

const dmlGen = new DMLGenerator(schema, registry);

// INSERT - returns parameterized statements
const insertResult = dmlGen.generateInsert('users', {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  tags: ['developer', 'typescript'],
});

console.log(insertResult.statements);
// [
//   "INSERT INTO users (id, username, email) VALUES (?, ?, ?);",
//   "INSERT INTO users_tags (users_id, index, value) VALUES (?, ?, ?);"
// ]

console.log(insertResult.values);
// [
//   [1, "alice", "alice@example.com"],
//   ["{{PARENT_ID}}", 0, "developer"],
//   ["{{PARENT_ID}}", 1, "typescript"]
// ]

// Execute with D1
const result = await db
  .prepare(insertResult.statements[0])
  .bind(...insertResult.values[0])
  .run();
const userId = result.meta.last_row_id;

// Execute array inserts with actual parent ID
for (let i = 1; i < insertResult.statements.length; i++) {
  const stmt = insertResult.statements[i].replace('{{PARENT_ID}}', userId);
  await db
    .prepare(stmt)
    .bind(...insertResult.values[i])
    .run();
}

// UPDATE - deletes and re-inserts array items
const updateResult = dmlGen.generateUpdate('users', updatedData, 'id = ?');
// Returns: UPDATE statement, DELETE for arrays, INSERT for new array items

// DELETE - cascade deletes array tables first
const deleteStatements = dmlGen.generateDelete('users', 'id = ?');
// Returns: [DELETE FROM users_tags..., DELETE FROM users...]
```

### Mock Data Generation

```typescript
import { generateMockData } from '@wonder/schemas';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 3, maxLength: 20 },
    age: { type: 'integer', minimum: 18, maximum: 99 },
    email: { type: 'string', pattern: '@' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
  },
  required: ['name', 'age'],
};

// Generate random data
const mockData = generateMockData(schema);
// { name: 'xK7mPq2nL', age: 47, email: 'abc@def.com', tags: ['qrs', 'tuv'], status: 'active' }

// Generate deterministic data with seed
const deterministicData = generateMockData(schema, { seed: 12345 });
// Always produces the same output for the same seed

// Custom options
const customMock = generateMockData(schema, {
  seed: 42,
  stringLength: { min: 10, max: 20 },
  arrayLength: { min: 2, max: 5 },
});
```

### Advanced: DDL & DML Generation Options

```typescript
// Strategy 1: Normalized (default) - arrays in separate tables
const ddlGen = new DDLGenerator(schema, registry, {
  nestedObjectStrategy: 'flatten', // user_name, user_email columns
  arrayStrategy: 'table', // Separate users_tags table with FK
});

const dmlGen = new DMLGenerator(schema, registry, {
  nestedObjectStrategy: 'flatten',
  arrayStrategy: 'table',
});

// Strategy 2: Denormalized - everything as JSON
const ddlGen = new DDLGenerator(schema, registry, {
  nestedObjectStrategy: 'json', // Single TEXT column with JSON object
  arrayStrategy: 'json', // Single TEXT column with JSON array
});

const dmlGen = new DMLGenerator(schema, registry, {
  nestedObjectStrategy: 'json',
  arrayStrategy: 'json',
});

// With JSON strategy, INSERT is much simpler (1 statement):
const { statements, values } = dmlGen.generateInsert('users', data);
// ["INSERT INTO users (id, username, email, tags) VALUES (?, ?, ?, ?);"]
// [[1, "alice", "alice@example.com", "[\"developer\",\"typescript\"]"]]
```

### Complete Example: Blog Posts with Comments

```typescript
const postSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    content: { type: 'string', minLength: 10 },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
    tags: { type: 'array', items: { type: 'string' } },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          text: { type: 'string' },
          upvotes: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
  required: ['id', 'title', 'content', 'status'],
};

// Generate DDL
const ddlGen = new DDLGenerator(postSchema, registry);
console.log(ddlGen.generateDDL('posts'));
/*
CREATE TABLE posts (
  id INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(title) >= 1 AND length(title) <= 200),
  content TEXT NOT NULL CHECK (length(content) >= 10),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  author_name TEXT,
  author_email TEXT
);

CREATE TABLE posts_tags (
  posts_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  value TEXT,
  FOREIGN KEY (posts_id) REFERENCES posts(rowid)
);

CREATE TABLE posts_comments (
  posts_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  author TEXT,
  text TEXT,
  upvotes INTEGER CHECK (upvotes >= 0),
  FOREIGN KEY (posts_id) REFERENCES posts(rowid)
);
*/

// Validate data
const validator = new Validator(postSchema, registry, { collectAllErrors: true });
const result = validator.validate({
  id: 1,
  title: 'Getting Started',
  content: 'This is a short post', // Invalid: too short
  status: 'pending', // Invalid: not in enum
  author: { name: 'Alice' },
  tags: ['tutorial'],
  comments: [
    { author: 'Bob', text: 'Great!', upvotes: -5 }, // Invalid: negative
  ],
});

if (!result.valid) {
  result.errors.forEach((err) => {
    console.log(`${err.path}: ${err.message}`);
  });
}
// Output:
// /content: String length 20 is less than minimum 10
// /status: Value 'pending' is not in allowed values: draft, published, archived
// /comments/0/upvotes: Number -5 is less than minimum 0

// Generate INSERT
const dmlGen = new DMLGenerator(postSchema, registry);
const { statements, values } = dmlGen.generateInsert('posts', {
  id: 1,
  title: 'Getting Started with Wonder',
  content: 'This is a comprehensive guide...',
  status: 'published',
  author: { name: 'Alice', email: 'alice@example.com' },
  tags: ['tutorial', 'workflow'],
  comments: [{ author: 'Bob', text: 'Great article!', upvotes: 5 }],
});

// Execute with D1
const postResult = await db
  .prepare(statements[0])
  .bind(...values[0])
  .run();
const postId = postResult.meta.last_row_id;

// Execute remaining statements (tags and comments)
for (let i = 1; i < statements.length; i++) {
  const stmt = statements[i].replace('{{PARENT_ID}}', postId);
  await db
    .prepare(stmt)
    .bind(...values[i])
    .run();
}
```

### Performance & Design

**Validation Performance:**

- ~0.25ms per validation (similar to Cabidela)
- Zero compilation overhead (runtime interpretation)
- No eval/Function() calls (Cloudflare Workers compatible)

**Architecture:**

- Single schema definition drives validation, DDL, and DML
- Custom types register once, work everywhere (validation + SQL mapping)
- Error collection: get all errors at once or fail fast
- JSON Pointer paths for precise error location

**Comparison with Cabidela:**

- Core validation logic ~95% identical
- Error collection vs exception-driven
- Adds DDL/DML generation capabilities
- Custom type system for domain-specific validation

## API Reference

### Core Classes

- **`Validator`** - Schema validation with error collection
- **`DDLGenerator`** - CREATE TABLE statement generation
- **`DMLGenerator`** - INSERT/UPDATE/DELETE statement generation
- **`CustomTypeRegistry`** - Register custom types with validation + SQL mapping

### Functions

- **`validateSchema(data, schema, customTypes?, options?)`** - Exception-driven validation
- **`generateMockData(schema, options?)`** - Generate random data conforming to schema

### Types

- **`JSONSchema`** - Schema definition (object, string, integer, array, etc.)
- **`ValidationError`** - Error with JSON Pointer path, code, expected/actual
- **`CustomTypeDefinition`** - Custom type with validate() and optional toSQL()
- **`SQLTypeMapping`** - SQL type (TEXT/INTEGER/REAL/BLOB) + constraints

## License

MIT - Incorporates code from:

- [Cabidela](https://github.com/cloudflare/cabidela) (MIT) © Cloudflare
- [@cfworker/json-schema](https://github.com/cfworker/cfworker) (MIT) © Jeremy Danyow
