import { describe, expect, it } from 'vitest';

/**
 * Task 3.1: OpenAPI Spec Extraction
 *
 * Extract paths object from OpenAPI spec for route parsing.
 */

describe('OpenAPI spec extraction', () => {
  it('should fetch and parse OpenAPI spec', async () => {
    const apiUrl = process.env.API_URL || 'https://api.wflow.app';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();

    expect(spec).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(typeof spec.paths).toBe('object');
  });

  it('should extract paths from OpenAPI spec', async () => {
    const apiUrl = process.env.API_URL || 'https://api.wflow.app';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();
    const paths = spec.paths;

    expect(paths).toBeDefined();
    expect(typeof paths).toBe('object');
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it('should have expected Wonder API paths', async () => {
    const apiUrl = process.env.API_URL || 'https://api.wflow.app';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();
    const paths = spec.paths;

    // Check that we have the workspaces collection
    expect(paths).toHaveProperty('/api/workspaces');

    // Check for at least one nested path (any workspace resource)
    const pathKeys = Object.keys(paths);
    const hasNestedPath = pathKeys.some((p) => p.startsWith('/api/workspaces/'));
    expect(hasNestedPath).toBe(true);
  });

  it('should have methods on paths', async () => {
    const apiUrl = process.env.API_URL || 'https://api.wflow.app';
    const response = await fetch(`${apiUrl}/doc`);
    const spec = await response.json();
    const paths = spec.paths;

    const workspacesPath = paths['/api/workspaces'];
    expect(workspacesPath).toBeDefined();

    // Should have at least one HTTP method
    const hasMethods = ['get', 'post', 'put', 'patch', 'delete'].some(
      (method) => method in workspacesPath,
    );
    expect(hasMethods).toBe(true);
  });
});
