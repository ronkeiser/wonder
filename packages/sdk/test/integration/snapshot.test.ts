import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClientCode, generateRootClient } from '../../scripts/generate-client.js';
import { convertOpenApiPaths } from '../../scripts/generate.js';
import { buildRouteTree } from '../../scripts/parse-paths.js';

/**
 * Snapshot Tests
 *
 * These tests capture the exact output of the generator for the minimal spec.
 * If the generator output changes, these tests will fail, requiring explicit approval
 * of the changes by updating the snapshots.
 *
 * This catches unintended changes to generated code structure.
 */
describe('Generator Snapshots', () => {
  const minimalSpec = JSON.parse(readFileSync('test/fixtures/minimal-spec.json', 'utf-8'));

  it('should generate consistent client code structure', () => {
    const paths = convertOpenApiPaths(minimalSpec.paths);
    const tree = buildRouteTree(paths);
    const clientStructure = generateRootClient(tree);
    const clientCode = formatClientCode(clientStructure);

    // Snapshot the entire generated client code
    expect(clientCode).toMatchSnapshot();
  });

  it('should generate consistent route tree structure', () => {
    const paths = convertOpenApiPaths(minimalSpec.paths);
    const tree = buildRouteTree(paths);

    // Create a simplified version for snapshotting (remove parent references to avoid circular refs)
    const simplifiedTree = JSON.parse(
      JSON.stringify(tree, (key, value) => (key === 'parent' ? undefined : value)),
    );

    expect(simplifiedTree).toMatchSnapshot();
  });

  it('should generate consistent path definitions', () => {
    const paths = convertOpenApiPaths(minimalSpec.paths);

    // Snapshot the parsed path definitions
    expect(paths).toMatchSnapshot();
  });

  it('should generate consistent collection structure for workspaces', () => {
    const paths = convertOpenApiPaths(minimalSpec.paths);
    const tree = buildRouteTree(paths);
    const clientStructure = generateRootClient(tree);

    // Find the workspaces collection
    const workspacesCollection = clientStructure.collections.find((c) => c.name === 'workspaces');

    expect(workspacesCollection).toMatchSnapshot();
  });

  it('should generate consistent method signatures', () => {
    const paths = convertOpenApiPaths(minimalSpec.paths);
    const tree = buildRouteTree(paths);
    const clientStructure = generateRootClient(tree);
    const clientCode = formatClientCode(clientStructure);

    // Extract just the method signatures (remove implementation details)
    const methodSignatures: string[] = [];

    // Match async method declarations
    const methodRegex = /(\w+):\s*async\s*\([^)]*\):\s*Promise<[^>]+>/g;
    let match;
    while ((match = methodRegex.exec(clientCode)) !== null) {
      methodSignatures.push(match[0]);
    }

    expect(methodSignatures).toMatchSnapshot();
  });
});
