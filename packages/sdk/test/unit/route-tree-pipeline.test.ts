import { describe, expect, it } from 'vitest';
import { buildRouteTree, type HttpMethod, type PathDefinition } from '../../scripts/parse-paths.js';

/**
 * Task 3.2: Route Tree Generation in Pipeline
 *
 * Verify that Phase 1 parser works with OpenAPI paths in the generation pipeline.
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

describe('Route tree generation in pipeline', () => {
  it('should convert OpenAPI paths to PathDefinition array', () => {
    const mockPaths = {
      '/api/workspaces': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);

    expect(pathDefs).toHaveLength(5);
    expect(pathDefs).toContainEqual({
      path: '/api/workspaces',
      method: 'get',
      operationId: undefined,
    });
    expect(pathDefs).toContainEqual({
      path: '/api/workspaces',
      method: 'post',
      operationId: undefined,
    });
  });

  it('should build tree from OpenAPI paths', () => {
    const mockPaths = {
      '/api/workspaces': { get: {}, post: {} },
      '/api/workspaces/{workspaceId}': { get: {}, patch: {}, delete: {} },
    };

    const pathDefs = convertOpenApiPaths(mockPaths);
    const tree = buildRouteTree(pathDefs);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('workspaces');
    expect(tree[0].type).toBe('collection');
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

    // Navigate to projects through the tree
    const workspaces = tree[0];
    const workspaceParam = workspaces.children.find((c) => c.name === 'workspaceId')!;
    const projects = workspaceParam.children.find((c) => c.name === 'projects')!;

    expect(projects.type).toBe('collection');
    expect(projects.methods).toBeDefined();
    expect(projects.children.some((c) => c.name === 'projectId')).toBe(true);
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

    const workflows = tree[0];
    const workflowParam = workflows.children.find((c) => c.name === 'workflowId')!;

    expect(workflowParam.children.some((c) => c.name === 'start')).toBe(true);
    const start = workflowParam.children.find((c) => c.name === 'start')!;
    expect(start.type).toBe('action');

    expect(workflowParam.children.some((c) => c.name === 'cancel')).toBe(true);
    const cancel = workflowParam.children.find((c) => c.name === 'cancel')!;
    expect(cancel.type).toBe('action');
  });

  it('should work with real OpenAPI spec structure', async () => {
    const apiUrl = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();
    const paths = spec.paths;

    const pathDefs = convertOpenApiPaths(paths);
    const tree = buildRouteTree(pathDefs);

    // Verify we got a tree
    expect(tree.length).toBeGreaterThan(0);

    // Verify we have workspaces collection
    const workspaces = tree.find((n) => n.name === 'workspaces');
    expect(workspaces).toBeDefined();
    expect(workspaces?.type).toBe('collection');
  });

  it('should preserve all HTTP methods', () => {
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

    const resources = tree[0];
    expect(resources.methods).toHaveLength(2);
    expect(resources.methods.map((m) => m.verb)).toContain('get');
    expect(resources.methods.map((m) => m.verb)).toContain('post');

    const resourceParam = resources.children.find((c) => c.name === 'resourceId')!;
    expect(resourceParam.methods).toHaveLength(3);
    expect(resourceParam.methods.map((m) => m.verb)).toContain('get');
    expect(resourceParam.methods.map((m) => m.verb)).toContain('patch');
    expect(resourceParam.methods.map((m) => m.verb)).toContain('delete');
  });
});
