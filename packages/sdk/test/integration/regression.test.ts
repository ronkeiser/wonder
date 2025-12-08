import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClientCode, generateRootClient } from '../../scripts/generate-client.js';
import { convertOpenApiPaths } from '../../scripts/generate.js';
import { buildRouteTree } from '../../scripts/parse-paths.js';

/**
 * Regression Tests
 *
 * These tests verify that the bugs we fixed are actually caught by our test suite.
 * Each test simulates what would happen if we reintroduced the original bugs.
 */
describe('Regression Prevention', () => {
  const minimalSpec = JSON.parse(readFileSync('test/fixtures/minimal-spec.json', 'utf-8'));

  describe('Bug: Types showing as any', () => {
    it('should fail if originalPath is missing from RouteMethod', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      // Check that originalPath is present on methods
      const workspacesNode = tree.find((n) => n.segment === 'workspaces');
      const postMethod = workspacesNode?.methods?.find((m) => m.verb === 'post');

      // If this fails, types would be 'any' because we can't build proper type paths
      expect(postMethod).toHaveProperty('originalPath');
      expect(postMethod?.originalPath).toBe('/api/workspaces');
    });

    it('should fail if generated code lacks proper type references', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Must have paths type references (not 'any' for return types)
      expect(clientCode).toContain("paths['/api/workspaces']");
      // Check that Promise return types are not 'any'
      expect(clientCode).not.toMatch(/Promise<any>/);
    });
  });

  describe('Bug: Incorrect requestBody type path', () => {
    it('should fail if NonNullable wrapper is missing', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // The original bug had an extra .content causing type errors
      // Correct: NonNullable<paths[...]>['content']['application/json']
      // Bug: NonNullable<paths[...]>['content']['content']['application/json']
      expect(clientCode).toContain(
        "NonNullable<paths['/api/workspaces']['post']['requestBody']>['content']['application/json']",
      );
      expect(clientCode).not.toContain("['content']['content']");
    });
  });

  describe('Bug: Hardcoded status codes', () => {
    it('should fail if status codes are not extracted from spec', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);

      // Collection POST should be 201 (from spec, not hardcoded)
      const workspacesNode = tree.find((n) => n.segment === 'workspaces');
      const postMethod = workspacesNode?.methods?.find((m) => m.verb === 'post');
      expect(postMethod?.successStatusCode).toBe('201');

      // Action POST should be 200 (from spec, not hardcoded assumption)
      const workflowsNode = tree.find((n) => n.segment === 'workflows');
      const idNode = workflowsNode?.children?.find((n) => n.segment === 'id');
      const startNode = idNode?.children?.find((n) => n.segment === 'start');
      const actionMethod = startNode?.methods?.find((m) => m.verb === 'post');
      expect(actionMethod?.successStatusCode).toBe('200');
    });

    it('should fail if generated code uses wrong status codes in type paths', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Collection POST must use 201 (not hardcoded 200)
      expect(clientCode).toContain("['responses']['201']");

      // Action POST must use 200 (not hardcoded 201)
      expect(clientCode).toContain(
        "paths['/api/workflows/{id}/start']['post']['responses']['200']",
      );
    });

    it('should handle 204 No Content correctly', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Should use 204 from spec, not default to 200 or 201
      expect(clientCode).toContain("paths['/api/tasks']['post']['responses']['204']");
    });
  });

  describe('Integration: All bugs together', () => {
    it('should generate fully type-safe client with correct status codes', () => {
      const paths = convertOpenApiPaths(minimalSpec.paths);
      const tree = buildRouteTree(paths);
      const clientStructure = generateRootClient(tree);
      const clientCode = formatClientCode(clientStructure);

      // Check all three bugs are fixed in generated code:

      // 1. Has proper type paths (not 'any')
      expect(clientCode).toMatch(
        /Promise<paths\[.*\]\['.*'\]\['responses'\]\['.*'\]\['content'\]\['application\/json'\]>/,
      );

      // 2. Uses NonNullable correctly (no double .content)
      expect(clientCode).toContain('NonNullable<');
      expect(clientCode).not.toContain("['content']['content']");

      // 3. Uses correct status codes from spec
      expect(clientCode).toContain("['201']"); // Collection POST
      expect(clientCode).toContain("['200']"); // Action POST and other methods
      expect(clientCode).toContain("['204']"); // No Content
    });
  });
});
