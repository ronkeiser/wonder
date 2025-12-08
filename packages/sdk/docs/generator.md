# Client Generator Implementation Plan

## Overview

Generate a type-safe, ergonomic client from OpenAPI spec that maps HTTP paths to nested method chains. The generator transforms REST paths into intuitive JavaScript APIs.

## Path Mapping Pattern

**Collection methods** (no ID): `client.resource.verb()`
**Instance methods** (ID in path): `client.resource(id).verb()`
**Sub-actions** (extra segments): `client.resource(id).action()`
**Nested resources**: `client.parent(id).child(childId).verb()`

HTTP verbs map to method names:

- POST → `create()` (collections) or custom action name
- GET → `list()` (collections) or `get()` (instances)
- PUT → `update()`
- DELETE → `delete()`
- Custom paths → use path segment as method name

## Implementation Phases

### Phase 1: Path Parser (Pure Logic)

**File:** `scripts/parse-paths.ts`

**Purpose:** Parse OpenAPI paths into a structured tree representing the API hierarchy.

**Input:** OpenAPI `paths` object from spec

**Output:** Tree of route nodes with type, name, HTTP methods, and children

**Route node types:**

- `collection` - Resource collection (e.g., `workspaces`)
- `param` - Path parameter (e.g., `:id`, `:project_id`)
- `action` - Custom action endpoint (e.g., `start`, `cancel`)

#### Task 1.1: Define Types (5 min)

Create TypeScript types for the route tree structure.

**Define:**

- `RouteNode` type with fields: type, name, methods, children, parent
- `HttpMethod` type for GET, POST, PUT, DELETE, PATCH
- `NodeType` enum for collection, param, action

**Test:** Types compile and export correctly

#### Task 1.2: Path Segment Parser (10 min)

Create function to parse a single path into segments.

**Function:** `parsePathSegments(path: string): string[]`

**Logic:**

- Split by `/`
- Filter empty segments
- Strip `/api/` prefix if present
- Return array of segments

**Test cases:**

- `/api/workspaces` → `['workspaces']`
- `/api/workspaces/{id}` → `['workspaces', '{id}']`
- `/api/projects/{project_id}/workflows` → `['projects', '{project_id}', 'workflows']`

#### Task 1.3: Segment Classifier (5 min)

Create function to classify segment type.

**Function:** `classifySegment(segment: string): NodeType`

**Logic:**

- If starts with `{` or `:` → `param`
- Otherwise → `collection` (or `action` if not first/last in chain)

**Test cases:**

- `workspaces` → `collection`
- `{id}` → `param`
- `:workspace_id` → `param`
- `start` → `action` (context-dependent)

#### Task 1.4: Tree Builder (15 min)

Create function to build tree from all paths.

**Function:** `buildRouteTree(paths: OpenAPI['paths']): RouteNode[]`

**Logic:**

1. Initialize empty root nodes array
2. For each path in OpenAPI spec:
   - Parse segments
   - Extract HTTP methods from path object
   - Walk tree, creating nodes as needed
   - Merge duplicate nodes (same name/type at same level)
   - Attach methods to leaf nodes
3. Return root nodes

**Test cases:**

- Single path: `/api/workspaces` with GET/POST → one collection node with two methods
- Nested path: `/api/workspaces/{id}` → collection node with param child
- Multiple resources: verify separate trees for `workspaces` and `projects`
- Deep nesting: `/api/a/{id}/b/{id}/c` → three-level tree

#### Task 1.5: Method Merger (5 min)

Handle multiple HTTP methods on same path.

**Logic:**

- When encountering existing node, merge methods array
- Deduplicate by HTTP verb
- Preserve operationId if present

**Test cases:**

- `/api/workspaces` with GET and POST → single node with both methods
- Same path defined twice → methods merged, no duplicates

#### Task 1.6: Integration Test (5 min)

Test complete parser with real OpenAPI sample.

**Test:**

- Fetch sample paths from Wonder API
- Parse into tree
- Verify structure matches expectations
- Check all resources present
- Validate nested resources correctly linked

**Time estimate:** 45 minutes total (more realistic than 30)

### Phase 2: Code Generator (AST Builder)

**File:** `scripts/generate-client.ts`

**Purpose:** Convert route tree into TypeScript AST for the generated client.

**Input:** Route tree from Phase 1

**Output:** TypeScript AST nodes (using `ts.factory`)

**Generation logic:**

For each route node:

- **Collection nodes** → Generate object with method properties
- **Parameter nodes** → Generate function that captures ID and returns object
- **Action nodes** → Generate method that calls base client

Each method:

- Constructs full path with captured parameters
- Calls `baseClient.GET()`, `baseClient.POST()`, etc.
- Passes through request body, query params, headers
- Returns typed response

**Type safety:**

- Reference generated OpenAPI types (`paths['/api/workspaces']['get']`)
- Use conditional types to extract request/response shapes
- Preserve all type information from OpenAPI spec

#### Task 2.1: HTTP Verb Mapping (10 min)

Create mapping from HTTP verbs to JavaScript method names.

**Logic:**

- POST on collection → `create()`
- POST on action → use action name (e.g., `start()`)
- GET on collection → `list()`
- GET on instance → `get()`
- PUT → `update()`
- DELETE → `delete()`
- PATCH → `patch()`

**Implementation:**

```typescript
function getMethodName(node: RouteNode, verb: HttpMethod): string {
  if (verb === 'post') {
    return node.type === NodeType.Action ? node.name : 'create';
  }
  if (verb === 'get') {
    return node.type === NodeType.Collection ? 'list' : 'get';
  }
  return verb; // put, delete, patch
}
```

**Test cases:**

- Collection GET → `list`
- Instance GET → `get`
- Collection POST → `create`
- Action POST → action name
- PUT → `update`
- DELETE → `delete`

#### Task 2.2: Path Template Builder (15 min)

Generate path template strings with parameter interpolation.

**Logic:**

- Walk from node to root, collecting segments
- Reverse to get correct order
- Replace params with `${paramName}` template literals
- Prefix with `/api/`

**Implementation:**

```typescript
function buildPathTemplate(node: RouteNode): string {
  const segments: string[] = [];
  let current: RouteNode | null = node;

  while (current) {
    if (current.type === NodeType.Param) {
      segments.unshift(`\${${current.name}}`);
    } else {
      segments.unshift(current.name);
    }
    current = current.parent;
  }

  return `/api/${segments.join('/')}`;
}
```

**Test cases:**

- `/api/workspaces` → `"/api/workspaces"`
- `/api/workspaces/{id}` → `"/api/workspaces/${id}"`
- `/api/workflows/{id}/start` → `"/api/workflows/${id}/start"`
- Verify correct parameter names used

#### Task 2.3: Method Signature Generator (20 min)

Generate TypeScript method signatures with proper parameter lists.

**Logic:**

- Extract path parameters from node ancestry
- Add request body parameter for POST/PUT/PATCH
- Add options parameter for query params, headers
- Return type references OpenAPI types

**Implementation:**

```typescript
interface MethodSignature {
  name: string;
  parameters: ts.ParameterDeclaration[];
  returnType: ts.TypeNode;
}

function generateMethodSignature(
  node: RouteNode,
  verb: HttpMethod,
  operationId?: string,
): MethodSignature {
  const methodName = getMethodName(node, verb);
  const parameters: ts.ParameterDeclaration[] = [];

  // Collect path parameters from ancestry
  let current: RouteNode | null = node;
  while (current) {
    if (current.type === NodeType.Param) {
      parameters.push(
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          current.name,
          undefined,
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ),
      );
    }
    current = current.parent;
  }

  // Add body parameter for mutation methods
  if (['post', 'put', 'patch'].includes(verb)) {
    parameters.push(
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        'body',
        undefined,
        ts.factory.createTypeReferenceNode('RequestBody'),
      ),
    );
  }

  // Add options parameter
  parameters.push(
    ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      'options',
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      ts.factory.createTypeReferenceNode('RequestOptions'),
    ),
  );

  // Return type
  const returnType = ts.factory.createTypeReferenceNode('Promise', [
    ts.factory.createTypeReferenceNode('ResponseData'),
  ]);

  return { name: methodName, parameters, returnType };
}
```

**Test cases:**

- Collection method has no path params
- Instance method has `id` parameter
- POST methods have `body` parameter
- All methods have optional `options` parameter
- Nested resources have multiple path params in correct order
- Return type is Promise<T>

#### Task 2.4: Collection Object Generator (20 min)

Generate object literal for collection nodes.

**Logic:**

- Create object with properties for each HTTP method
- Properties are arrow functions with generated signatures
- Functions return base client calls

**Implementation:**

```typescript
function generateCollectionObject(node: RouteNode): ts.ObjectLiteralExpression {
  const properties: ts.PropertyAssignment[] = [];

  for (const method of node.methods) {
    const sig = generateMethodSignature(node, method.verb, method.operationId);
    const pathTemplate = buildPathTemplate(node);

    // Create arrow function
    const arrowFunc = ts.factory.createArrowFunction(
      undefined,
      undefined,
      sig.parameters,
      sig.returnType,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      // Body: baseClient[verb](path, body, options)
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('baseClient'),
          method.verb.toUpperCase(),
        ),
        undefined,
        [
          /* path, body, options args */
        ],
      ),
    );

    properties.push(ts.factory.createPropertyAssignment(sig.name, arrowFunc));
  }

  // Add child resources/actions as nested properties
  for (const child of node.children) {
    if (child.type === NodeType.Param) {
      properties.push(generateParameterProperty(child));
    } else {
      properties.push(
        ts.factory.createPropertyAssignment(child.name, generateCollectionObject(child)),
      );
    }
  }

  return ts.factory.createObjectLiteralExpression(properties, true);
}
```

**Test cases:**

- Single method collection generates one property
- Multiple methods generate multiple properties
- Child collections added as nested properties
- Parameter nodes generate functions (not objects)
- Verify object structure compiles

#### Task 2.5: Parameter Function Generator (20 min)

Generate functions for parameter nodes.

**Logic:**

- Parameter nodes become functions that capture the ID
- Return object with methods/children
- ID is available in closure for path construction

**Implementation:**

```typescript
function generateParameterProperty(node: RouteNode): ts.PropertyAssignment {
  // Function parameter
  const idParam = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    node.name,
    undefined,
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
  );

  // Function body: return object with methods/children
  const returnObject = generateCollectionObject(node);

  const arrowFunc = ts.factory.createArrowFunction(
    undefined,
    undefined,
    [idParam],
    undefined,
    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    returnObject,
  );

  return ts.factory.createPropertyAssignment(node.name, arrowFunc);
}
```

**Test cases:**

- Parameter function accepts string parameter
- Returns object with instance methods
- Captured ID used in path template
- Child actions available on returned object
- Verify function structure compiles

#### Task 2.6: Root Client Generator (15 min)

Generate the root client object and export.

**Logic:**

- Create `createClient()` factory function
- Accepts base client as parameter
- Returns object with all root collections
- Export as default

**Implementation:**

```typescript
function generateRootClient(roots: RouteNode[]): ts.SourceFile {
  const properties = roots.map((node) =>
    ts.factory.createPropertyAssignment(node.name, generateCollectionObject(node)),
  );

  const clientObject = ts.factory.createObjectLiteralExpression(properties, true);

  // createClient function
  const createClientFunc = ts.factory.createFunctionDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    undefined,
    'createClient',
    undefined,
    [
      /* baseClient parameter */
    ],
    undefined,
    ts.factory.createBlock([ts.factory.createReturnStatement(clientObject)]),
  );

  return ts.factory.createSourceFile(
    [, /* imports */ createClientFunc],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );
}
```

**Test cases:**

- Multiple root collections all present
- createClient function exported
- Accepts baseClient parameter
- Returns properly typed object
- Verify complete file compiles

#### Task 2.7: Integration Test (20 min)

Generate complete client from Wonder API paths and verify.

**Test:**

- Use paths from Task 1.6
- Generate complete client code
- Write to temporary file
- Compile with `tsc --noEmit`
- Verify no errors
- Check output structure matches expectations

**Validation:**

- All root resources present
- Instance methods accept ID
- Action methods have correct names
- Path templates correct
- Types reference OpenAPI schema

**Time estimate:** 2 hours total

### Phase 3: Integration (Update generate.ts)

**File:** `scripts/generate.ts`

**Purpose:** Orchestrate the complete generation process.

**Implementation tasks:**

#### Task 3.1: OpenAPI Spec Extraction (10 min)

Extract paths object from OpenAPI spec after type generation.

**Implementation:**

- Import `buildRouteTree` from parse-paths
- Import `generateRootClient` from generate-client
- After `astToString(ast)` completes, extract paths from ast
- Store paths in variable for next step

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import openapiTS from 'openapi-typescript';

describe('OpenAPI spec extraction', () => {
  it('should extract paths from OpenAPI spec', async () => {
    const ast = await openapiTS(new URL('...'));
    const paths = extractPaths(ast);

    expect(paths).toBeDefined();
    expect(typeof paths).toBe('object');
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it('should have expected Wonder API paths', async () => {
    const ast = await openapiTS(new URL('...'));
    const paths = extractPaths(ast);

    expect(paths).toHaveProperty('/workspaces');
    expect(paths).toHaveProperty('/workspaces/{workspaceId}');
  });
});
```

**Validation:**

- Paths object contains all routes
- Routes have methods (get, post, etc.)
- Structure matches OpenAPI spec

#### Task 3.2: Route Tree Generation (10 min)

Use Phase 1 parser to build route tree from extracted paths.

**Implementation:**

- Call `buildRouteTree(paths)` with extracted paths
- Store resulting tree for next step

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { buildRouteTree } from '../scripts/parse-paths.js';

describe('Route tree generation in pipeline', () => {
  it('should build tree from OpenAPI paths', () => {
    const mockPaths = {
      '/workspaces': { get: {}, post: {} },
      '/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const tree = buildRouteTree(mockPaths);

    expect(tree.children).toHaveProperty('workspaces');
    expect(tree.children.workspaces.type).toBe('collection');
  });
});
```

**Validation:**

- Tree structure is valid
- All paths represented
- Hierarchy preserved

#### Task 3.3: Client Code Generation (10 min)

Use Phase 2 generator to create client code from route tree.

**Implementation:**

- Call `generateRootClient(tree)` with route tree
- Get back client structure object

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { buildRouteTree } from '../scripts/parse-paths.js';
import { generateRootClient } from '../scripts/generate-client.js';

describe('Client code generation in pipeline', () => {
  it('should generate client from route tree', () => {
    const mockPaths = {
      '/workspaces': { get: {}, post: {} },
      '/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const tree = buildRouteTree(mockPaths);
    const client = generateRootClient(tree);

    expect(client).toHaveProperty('workspaces');
    expect(client.workspaces).toHaveProperty('code');
    expect(client.workspaces.code).toContain('workspaces(id: string)');
  });
});
```

**Validation:**

- Client structure complete
- All collections present
- Methods properly generated

#### Task 3.4: Client Code Formatting (15 min)

Convert client structure to formatted TypeScript code.

**Implementation:**

- Create `formatClientCode(structure: ClientStructure): string` function
- Generate imports section
- Generate type exports
- Generate client function
- Add JSDoc comments
- Format with proper indentation

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { ClientStructure } from '../scripts/generate-client.js';

describe('Client code formatting', () => {
  it('should format client structure as TypeScript code', () => {
    const mockStructure: ClientStructure = {
      workspaces: {
        code: 'workspaces(id: string) { return {...}; }',
        type: 'collection',
        methods: [],
      },
    };

    const code = formatClientCode(mockStructure);

    expect(code).toContain('export function createClient');
    expect(code).toContain('workspaces(id: string)');
    expect(code).toMatch(/import.*SchemaType/);
  });

  it('should include proper imports', () => {
    const code = formatClientCode({});

    expect(code).toContain('import type { paths }');
    expect(code).toContain('import type { SchemaType }');
  });

  it('should add JSDoc comments', () => {
    const code = formatClientCode({});

    expect(code).toMatch(/\/\*\*/);
    expect(code).toContain('Generated client');
  });
});
```

**Validation:**

- Valid TypeScript syntax
- All imports present
- Proper formatting
- JSDoc comments included

#### Task 3.5: File Writing (10 min)

Write generated code to output files.

**Implementation:**

- Write schema types to `src/generated/schema.d.ts` (already done)
- Write client code to `src/generated/client.ts`
- Ensure directories exist
- Handle file write errors

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('File writing', () => {
  it('should write client.ts to generated directory', async () => {
    await runGeneration();

    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    expect(existsSync(clientPath)).toBe(true);
  });

  it('should write valid TypeScript', async () => {
    await runGeneration();

    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    expect(content).toContain('export function createClient');
    expect(content).toMatch(/import.*SchemaType/);
  });
});
```

**Validation:**

- Files created in correct location
- Content matches expected format
- No write errors

#### Task 3.6: End-to-End Integration Test (20 min)

Run complete generation and verify output compiles and works.

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('End-to-end generation', () => {
  it('should generate complete SDK without errors', async () => {
    const { stdout, stderr } = await execAsync('pnpm generate');

    expect(stderr).toBe('');
    expect(stdout).toContain('Generated');
  });

  it('should produce code that compiles', async () => {
    await execAsync('pnpm generate');
    const { stderr } = await execAsync('pnpm tsc --noEmit');

    expect(stderr).toBe('');
  });

  it('should export createClient function', async () => {
    await execAsync('pnpm generate');

    // Dynamic import to test the generated code
    const { createClient } = await import('../src/generated/client.js');

    expect(typeof createClient).toBe('function');
  });

  it('should have proper TypeScript types', async () => {
    await execAsync('pnpm generate');

    const { createClient } = await import('../src/generated/client.js');
    const mockBaseClient = {} as any;
    const client = createClient(mockBaseClient);

    // Type assertions - these will fail at compile time if types are wrong
    expect(client).toHaveProperty('workspaces');
    expect(typeof client.workspaces).toBe('function');
  });
});
```

**Validation:**

- Generation script runs without errors
- Both files created
- TypeScript compilation succeeds
- Generated client exports expected interface
- Types provide proper autocomplete

**Time estimate:** 1.5 hours total

### Phase 4: Runtime Client Base

**File:** `src/client-base.ts`

**Purpose:** Provide runtime utilities that the generated client uses.

#### Task 4.1: Core Type Definitions (5 min)

Define TypeScript interfaces for runtime client structures.

**Create:** `src/client-base.ts` with type definitions

**Types:**

- `CollectionMethods` - Interface for collection operations (create, list)
- `InstanceMethods` - Interface for instance operations (get, update, delete)
- `ActionMethod` - Generic action handler type
- `ClientConfig` - Configuration for base client

**Test:**

```typescript
import { describe, it, expect } from 'vitest';
import type { CollectionMethods, InstanceMethods } from '../src/client-base';

describe('client-base types', () => {
  it('should define CollectionMethods interface', () => {
    const methods: CollectionMethods = {
      create: expect.any(Function),
      list: expect.any(Function),
    };
    expect(methods).toBeDefined();
  });

  it('should define InstanceMethods interface', () => {
    const methods: InstanceMethods = {
      get: expect.any(Function),
      update: expect.any(Function),
      delete: expect.any(Function),
    };
    expect(methods).toBeDefined();
  });
});
```

**Validation:**

- Types compile and export correctly
- Interfaces define expected method signatures

#### Task 4.2: Path Construction Utility (10 min)

Create utility to build paths with parameter substitution.

**Function:** `buildPath(segments: string[], params: Record<string, string>): string`

**Logic:**

- Join segments with `/`
- Add `/api/` prefix
- Replace `:param` placeholders with values from params object
- Throw error if required parameter is missing

**Test:**

```typescript
describe('buildPath', () => {
  it('should build simple path', () => {
    expect(buildPath(['workspaces'])).toBe('/api/workspaces');
  });

  it('should substitute path parameters', () => {
    expect(buildPath(['workspaces', ':id'], { id: '123' })).toBe('/api/workspaces/123');
  });

  it('should handle nested parameters', () => {
    expect(
      buildPath(['projects', ':project_id', 'workflows', ':id'], {
        project_id: 'p1',
        id: 'w1',
      }),
    ).toBe('/api/projects/p1/workflows/w1');
  });

  it('should throw on missing parameter', () => {
    expect(() => buildPath(['workspaces', ':id'], {})).toThrow('Missing parameter: id');
  });
});
```

**Validation:**

- Correctly builds paths from segments
- Substitutes all parameters
- Errors on missing parameters

#### Task 4.3: Collection Factory (15 min)

Create function that returns collection methods (create, list).

**Function:** `createCollection(baseClient: any, path: string): CollectionMethods`

**Returns object with:**

- `create(data)` - POST to collection with body
- `list(query?)` - GET collection with optional query params

**Logic:**

- `create` calls `baseClient.POST(path, { body: data })`
- `list` calls `baseClient.GET(path, { params: { query } })`

**Test:**

```typescript
describe('createCollection', () => {
  it('should create collection with create method', () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    expect(collection).toHaveProperty('create');
    expect(typeof collection.create).toBe('function');
  });

  it('should call POST with correct path for create', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.create({ name: 'Test' });

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workspaces', {
      body: { name: 'Test' },
    });
  });

  it('should have list method', () => {
    const mockClient = { GET: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    expect(collection).toHaveProperty('list');
  });

  it('should call GET for list', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.list();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {});
  });

  it('should pass query params to list', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.list({ limit: 10 });

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {
      params: { query: { limit: 10 } },
    });
  });
});
```

**Validation:**

- Collection has create and list methods
- Methods call base client with correct paths
- Query params passed through for list

#### Task 4.4: Instance Factory (15 min)

Create function that returns instance methods (get, update, delete).

**Function:** `createInstance(baseClient: any, path: string, id: string): InstanceMethods`

**Returns object with:**

- `get()` - GET instance
- `update(data)` - PUT instance with body
- `delete()` - DELETE instance

**Logic:**

- Replace `:id` parameter in path with provided ID
- Call appropriate HTTP method on base client

**Test:**

```typescript
describe('createInstance', () => {
  it('should inject ID into path for get', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { id: '123' } }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.get();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should inject ID for update', async () => {
    const mockClient = {
      PUT: vi.fn().mockResolvedValue({ data: { id: '123' } }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.update({ name: 'Updated' });

    expect(mockClient.PUT).toHaveBeenCalledWith('/api/workspaces/123', {
      body: { name: 'Updated' },
    });
  });

  it('should inject ID for delete', async () => {
    const mockClient = {
      DELETE: vi.fn().mockResolvedValue({ data: null }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.delete();

    expect(mockClient.DELETE).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should support nested resource paths', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: {} }),
    };

    const instance = createInstance(mockClient, '/api/projects/:project_id/workflows/:id', 'w123');

    // Note: parent ID should already be in path
    await instance.get();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/projects/:project_id/workflows/w123', {});
  });
});
```

**Validation:**

- ID correctly injected into path
- All CRUD methods work
- Supports nested resource paths

#### Task 4.5: Action Factory (10 min)

Create generic action handler for custom endpoints.

**Function:** `createAction(baseClient: any, path: string, method: string): ActionMethod`

**Returns function that:**

- Accepts optional body/params
- Calls specified HTTP method on path
- Returns response

**Logic:**

- Return async function that calls `baseClient[method](path, options)`
- Handle body for POST/PUT, empty options for GET/DELETE

**Test:**

```typescript
describe('createAction', () => {
  it('should create action that calls correct method', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { status: 'started' } }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/start', 'POST');
    await action({ force: true });

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/start', {
      body: { force: true },
    });
  });

  it('should support GET actions', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { status: 'healthy' } }),
    };

    const action = createAction(mockClient, '/api/health', 'GET');
    await action();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/health', {});
  });

  it('should handle actions without body', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: {} }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/cancel', 'POST');
    await action();

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/cancel', {});
  });
});
```

**Validation:**

- Action calls correct HTTP method
- Body passed through when provided
- Works with all HTTP methods

#### Task 4.6: Collection with Instance Access (15 min)

Extend collection to support callable syntax for accessing instances.

**Pattern:** `client.workspaces('123')` returns instance methods

**Implementation:**

- Make collection object callable (function with properties)
- When called with ID, return instance methods
- Preserve collection methods as properties

**Test:**

```typescript
describe('collection with instance access', () => {
  it('should allow calling collection as function', () => {
    const mockClient = { GET: vi.fn(), POST: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    expect(typeof collection).toBe('function');
  });

  it('should return instance methods when called with ID', () => {
    const mockClient = { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    const instance = collection('123');

    expect(instance).toHaveProperty('get');
    expect(instance).toHaveProperty('update');
    expect(instance).toHaveProperty('delete');
  });

  it('should have both collection and instance methods', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    // Collection methods
    await collection.list();
    expect(mockClient.GET).toHaveBeenCalled();

    // Instance methods
    const instance = collection('123');
    await instance.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});
  });
});
```

**Validation:**

- Collection is callable as function
- Returns instance methods when called with ID
- Preserves collection methods as properties
- Supports method chaining

**Time estimate:** 1 hour 10 minutes total

## File Structure

```
packages/sdk/
├── scripts/
│   ├── generate.ts              # Main orchestrator
│   ├── parse-paths.ts           # Phase 1: Parse OpenAPI paths
│   └── generate-client.ts       # Phase 2: Generate client AST
├── src/
│   ├── client-base.ts           # Phase 4: Runtime utilities
│   ├── generated/
│   │   ├── schema.d.ts          # Generated types
│   │   └── client.ts            # Generated client
│   └── index.ts                 # Public API exports
└── docs/
    └── generator.md             # This document
```

## Benefits

**Type safety:** Full TypeScript types from OpenAPI spec
**Ergonomics:** Nested method chains match resource hierarchy
**Maintainability:** Regenerate when API changes, zero manual work
**Discoverability:** Autocomplete guides you through the API
**Consistency:** Same pattern for all resources

## Alternative Considered: Flat Methods

Instead of nested chains, use flat methods like `client.createWorkspace()`, `client.getWorkflow(id)`.

**Rejected because:**

- Namespace pollution (100+ methods on client object)
- Less intuitive for nested resources
- Harder to discover related methods
- Doesn't scale well with deep nesting

Nested chains group related operations naturally and scale to arbitrary depth.
