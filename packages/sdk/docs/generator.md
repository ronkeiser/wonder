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

**Testing strategy:**

- Generate code for simple tree
- Verify it compiles with `tsc`
- Check method signatures match expectations

**Time estimate:** 45 minutes

### Phase 3: Integration (Update generate.ts)

**File:** `scripts/generate.ts`

**Purpose:** Orchestrate the complete generation process.

**Steps:**

1. Fetch OpenAPI spec from HTTP service
2. Generate TypeScript types with transform hook (already implemented)
3. Parse routes into tree structure (Phase 1)
4. Generate client code from tree (Phase 2)
5. Write types to `src/generated/schema.d.ts`
6. Write client to `src/generated/client.ts`

**Output files:**

- `schema.d.ts` - OpenAPI types with `SchemaType` transforms
- `client.ts` - Generated client with nested resource methods

**Testing strategy:**

- Run full generation pipeline
- Verify both files are created
- Check types and client work together
- Import in test file and verify autocomplete

**Time estimate:** 15 minutes

### Phase 4: Runtime Client Base

**File:** `src/client-base.ts`

**Purpose:** Provide runtime utilities that the generated client uses.

**Core functions:**

**`createCollection(baseClient, path)`**

- Returns object with collection methods (create, list, etc.)
- Each method constructs full path and calls base client
- Handles request body, query params, headers

**`createInstance(baseClient, path, id)`**

- Returns object with instance methods (get, update, delete, etc.)
- Injects ID into path
- Supports nested resources via chaining

**`createAction(baseClient, path, method)`**

- Generic action handler for custom endpoints
- Used for non-CRUD operations (start, cancel, etc.)

**Path construction:**

- Build paths dynamically from segments
- Handle parameter substitution
- Preserve type safety through generics

**Testing strategy:**

- Manual smoke test with generated client
- Create workspace, project, workflow
- Verify all methods work end-to-end

**Time estimate:** 30 minutes

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
