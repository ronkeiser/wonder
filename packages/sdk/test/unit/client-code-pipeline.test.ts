import { describe, expect, it } from 'vitest';
import { generateRootClient, type ClientStructure } from '../../scripts/generate-client.js';
import { buildRouteTree, type HttpMethod, type PathDefinition } from '../../scripts/parse-paths.js';

/**
 * Task 3.3: Client Code Generation in Pipeline
 *
 * Verify that Phase 2 generator works with route trees in the generation pipeline.
 */

/**
 * Convert OpenAPI paths object to PathDefinition array
 */
function convertOpenApiPaths(paths: Record<string, Record<string, any>>): PathDefinition[] {
  const result: PathDefinition[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      // Only include valid HTTP methods
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        result.push({
          path,
          method: method as HttpMethod,
          operationId: operation?.operationId,
        });
      }
    }
  }

  return result;
}

describe('Client code generation in pipeline', () => {
  it('should generate client from route tree', () => {
    const mockPaths = {
      '/api/workspaces': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    expect(client.collections).toHaveLength(1);
    expect(client.collections[0].name).toBe('workspaces');
    expect(client.collections[0].type).toBe('collection');
  });

  it('should handle nested resources', () => {
    const mockPaths = {
      '/api/workspaces': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
      '/api/workspaces/{workspaceId}/projects': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}/projects/{projectId}': { get: {}, patch: {}, delete: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    expect(client.collections).toHaveLength(1);
    const workspaces = client.collections[0];
    expect(workspaces.name).toBe('workspaces');

    // Verify it has children (the parameter and its nested resources)
    expect(workspaces.children).toBeDefined();
    expect(workspaces.children!.length).toBeGreaterThan(0);
  });

  it('should handle action endpoints', () => {
    const mockPaths = {
      '/api/workflows': { get: {}, post: {} },
      '/api/workflows/{workflowId}': { get: {}, patch: {}, delete: {} },
      '/api/workflows/{workflowId}/start': { post: {} },
      '/api/workflows/{workflowId}/cancel': { post: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    expect(client.collections).toHaveLength(1);
    const workflows = client.collections[0];
    expect(workflows.name).toBe('workflows');

    // Verify it has children (parameter with actions)
    expect(workflows.children).toBeDefined();
    expect(workflows.children!.length).toBeGreaterThan(0);
  });

  it('should generate all HTTP methods', () => {
    const mockPaths = {
      '/api/resources': {
        get: { operationId: 'list' },
        post: { operationId: 'create' },
      },
      '/api/resources/{resourceId}': {
        get: { operationId: 'get' },
        patch: { operationId: 'update' },
        delete: { operationId: 'delete' },
      },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    expect(client.collections).toHaveLength(1);
    const resources = client.collections[0];

    // Collection methods
    expect(resources.methods).toBeDefined();
    const methodNames = resources.methods?.map((m) => m.name) || [];
    expect(methodNames).toContain('list');
    expect(methodNames).toContain('create');

    // Verify has children (parameters with instance methods)
    expect(resources.children).toBeDefined();
    expect(resources.children!.length).toBeGreaterThan(0);
  });

  it('should work with real OpenAPI spec structure', async () => {
    const apiUrl = process.env.API_URL || 'https://api.wflow.app';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();
    const paths = spec.paths;

    const pathDefs = convertOpenApiPaths(paths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    // Verify we got client structure
    expect(client.collections.length).toBeGreaterThan(0);

    // Verify workspaces collection exists
    const workspaces = client.collections.find((c) => c.name === 'workspaces');
    expect(workspaces).toBeDefined();
    expect(workspaces?.type).toBe('collection');
  });

  it('should preserve type information', () => {
    const mockPaths = {
      '/api/workspaces': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);
    const client = generateRootClient(tree);

    const workspaces = client.collections[0];
    expect(workspaces.type).toBe('collection');
    expect(workspaces.methods).toBeDefined();
    expect(workspaces.methods!.length).toBeGreaterThan(0);

    // Verify method signatures exist with proper structure
    workspaces.methods!.forEach((method) => {
      expect(method.signature).toBeTruthy();
      expect(method.signature).toHaveProperty('name');
      expect(method.signature).toHaveProperty('parameters');
      expect(Array.isArray(method.signature.parameters)).toBe(true);
    });
  });
});
