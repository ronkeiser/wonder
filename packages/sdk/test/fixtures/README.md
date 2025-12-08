# Test Fixtures

## minimal-spec.json

A minimal OpenAPI 3.1 spec covering key test scenarios:

### Endpoints

1. **GET /api/workspaces** - Collection list (returns 200)
2. **POST /api/workspaces** - Collection create (returns 201)
3. **GET /api/workspaces/{id}** - Instance get (returns 200)
4. **PATCH /api/workspaces/{id}** - Instance update with optional requestBody (returns 200)
5. **DELETE /api/workspaces/{id}** - Instance delete (returns 200)
6. **POST /api/workflows/{id}/start** - Action endpoint (returns 200, not 201)
7. **POST /api/tasks** - Edge case: 204 No Content response

### Test Coverage

- ✅ Different HTTP methods (GET, POST, PATCH, DELETE)
- ✅ Different status codes (200, 201, 204)
- ✅ Optional requestBody fields
- ✅ Nested response structures
- ✅ Path parameters
- ✅ Collection vs action endpoint patterns
