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

```typescript
import { Validator, validateSchema } from '@wonder/validator';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'number', minimum: 0 },
    email: { type: 'string', format: 'email' },
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

## License

MIT - Incorporates code from:

- [Cabidela](https://github.com/cloudflare/cabidela) (MIT) © Cloudflare
- [@cfworker/json-schema](https://github.com/cfworker/cfworker) (MIT) © Jeremy Danyow
