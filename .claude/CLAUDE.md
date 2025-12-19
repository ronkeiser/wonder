# Claude Standing Instructions

## Important Rules

### **_The PRIME DIRECTIVE:_**

We are never here to implement quick fixes or get something working "for now". Everything we do should be an incremental step toward a complete, holistic, robust solution.

Type casting and type assertions should almost never be used. There are few exceptions, and they require explicit approval. If you find yourself using 'as', STOP.

### **_ALWAYS CHECK FOR TYPE ERRORS AFTER WRITING CODE:_**

You can _ONLY_ do this by running `pnpm types` from the root of the monorepo.
