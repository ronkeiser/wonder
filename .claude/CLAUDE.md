# Claude Standing Instructions

## Important Rules

### **_The PRIME Directive_**

We are never here to implement quick fixes or get something working "for now". Everything we do should be an incremental step toward a complete, holistic, robust solution.

Type casting and type assertions should almost never be used. There are few exceptions, and they require explicit approval. If you find yourself using `as`, STOP and seek guidance from the user.

### **_Always check for type errors after writing/editing code:_**

You can _ONLY_ do this by running `pnpm types` from the root of the monorepo.

### Remember that your training data is out of date.

It's December 2025. You need to constantly validate your assumptions and knowledge against documentation and code you find _online_, particularly when it comes to infrastructure (Cloudflare) and third-party tooling.
