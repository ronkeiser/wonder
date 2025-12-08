import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClientCode, generateRootClient } from '../../scripts/generate-client.js';
import { convertOpenApiPaths } from '../../scripts/generate.js';
import { buildRouteTree } from '../../scripts/parse-paths.js';

describe('SDK Generator Integration', () => {
  const minimalSpec = JSON.parse(readFileSync('test/fixtures/minimal-spec.json', 'utf-8'));

  describe('Status Code Extraction', () => {
    it('should extract 201 for collection POST endpoints', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      const workspacesNode = tree.find((n) => n.segment === 'workspaces');
      const postMethod = workspacesNode?.methods?.find((m) => m.verb === 'post');

      expect(postMethod?.successStatusCode).toBe('201');
    });

    it('should extract 200 for action POST endpoints', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      const workflowsNode = tree.find((n) => n.segment === 'workflows');
      const idNode = workflowsNode?.children?.find((n) => n.segment === 'id');
      const startNode = idNode?.children?.find((n) => n.segment === 'start');
      const postMethod = startNode?.methods?.find((m) => m.verb === 'post');

      expect(postMethod?.successStatusCode).toBe('200');
    });

    it('should extract 204 for No Content responses', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      const tasksNode = tree.find((n) => n.segment === 'tasks');
      const postMethod = tasksNode?.methods?.find((m) => m.verb === 'post');

      expect(postMethod?.successStatusCode).toBe('204');
    });

    it('should default to 200 when no 2xx status code found', () => {
      const pathsWithoutSuccess = convertOpenApiPaths({
        '/test': {
          get: {
            operationId: 'getTest',
            responses: {
              '404': { description: 'Not found' },
              '500': { description: 'Server error' },
            },
          },
        },
      });
      const tree = buildRouteTree(pathsWithoutSuccess);

      const testNode = tree.find((n) => n.segment === 'test');
      const getMethod = testNode?.methods?.find((m) => m.verb === 'get');

      expect(getMethod?.successStatusCode).toBe('200');
    });
  });

  describe('Type Path Generation', () => {
    it('should generate NonNullable wrapper for requestBody types', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Should use NonNullable<paths[...]>['content']['application/json']
      expect(clientCode).toContain(
        "NonNullable<paths['/api/workspaces']['post']['requestBody']>['content']['application/json']",
      );
    });

    it('should use extracted status codes in response type paths', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Collection POST should use 201
      expect(clientCode).toContain("paths['/api/workspaces']['post']['responses']['201']");

      // Action POST should use 200
      expect(clientCode).toContain(
        "paths['/api/workflows/{id}/start']['post']['responses']['200']",
      );
    });

    it('should use correct paths for GET responses', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // GET should use 200
      expect(clientCode).toContain("paths['/api/workspaces']['get']['responses']['200']");
    });
  });

  describe('Generated Code Structure', () => {
    it('should generate compilable TypeScript code', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const formatted = formatClientCode(clientStructure);

      // Should have proper imports
      expect(formatted).toContain("import type { paths } from './schema.js'");

      // Should export createClient function
      expect(formatted).toContain('export function createClient');

      // Should have no obvious syntax errors (balanced braces)
      const openBraces = (formatted.match(/{/g) || []).length;
      const closeBraces = (formatted.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    it('should generate collections with proper methods', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Collection with instances should use Object.assign
      expect(clientCode).toContain('workspaces: Object.assign');

      // Should have collection methods
      expect(clientCode).toMatch(/list:\s*async/);
      expect(clientCode).toMatch(/create:\s*async/);
    });

    it('should preserve originalPath for type generation', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      const workspacesNode = tree.find((n) => n.segment === 'workspaces');
      const idNode = workspacesNode?.children?.find((n) => n.segment === 'id');
      const getMethod = idNode?.methods?.find((m) => m.verb === 'get');

      // Should preserve the OpenAPI path format
      expect(getMethod?.originalPath).toBe('/api/workspaces/{id}');
    });
  });

  describe('Edge Cases', () => {
    it('should handle endpoints without requestBody', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // GET requests shouldn't have body parameter
      const getWorkspaces = clientCode.match(/list:\s*async\s*\([^)]*\)/);
      expect(getWorkspaces?.[0]).not.toContain('body:');
    });

    it('should handle No Content (204) responses', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Tasks POST should use 204
      expect(clientCode).toContain("paths['/api/tasks']['post']['responses']['204']");
    });

    it('should handle multiple 2xx status codes by choosing first', () => {
      const pathsWithMultiple = convertOpenApiPaths({
        '/multi': {
          post: {
            operationId: 'createMulti',
            responses: {
              '200': { description: 'OK' },
              '201': { description: 'Created' },
              '202': { description: 'Accepted' },
            },
          },
        },
      });
      const tree = buildRouteTree(pathsWithMultiple);

      const multiNode = tree.find((n) => n.segment === 'multi');
      const postMethod = multiNode?.methods?.find((m) => m.verb === 'post');

      // Should pick the first 2xx code (200)
      expect(postMethod?.successStatusCode).toBe('200');
    });
  });
});
