# @wonder/validator

Fast, Cloudflare Workers-compatible JSON Schema validator for Wonder.

## Features

- ⚡ **Fast**: Based on Cabidela's runtime-optimized validation (no compilation step)
- 🔧 **CF Workers compatible**: No eval, no code generation
- 📝 **Format validation**: Email, URL, UUID, ULID, date/datetime validators from @cfworker
- ❌ **Flexible error handling**: Exception-driven or collect-all-errors modes
- 🎯 **Partial validation**: Validate incremental context updates
- 🔒 **Strict mode**: Reject unknown properties
- 📊 **Rich error details**: Path, keyword, and schema location tracking

## Installation

```bash
pnpm add @wonder/validator
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
