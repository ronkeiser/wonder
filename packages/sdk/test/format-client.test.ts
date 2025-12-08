import { describe, expect, it } from 'vitest';
import { formatClientCode, type ClientStructure } from '../scripts/generate-client.js';

/**
 * Task 3.4: Client Code Formatting
 *
 * Convert client structure to formatted TypeScript code.
 */

describe('Client code formatting', () => {
  it('should format client structure as TypeScript code', () => {
    const mockStructure: ClientStructure = {
      collections: [
        {
          name: 'workspaces',
          type: 'collection',
          methods: [],
        },
      ],
    };

    const code = formatClientCode(mockStructure);

    expect(code).toContain('export function createClient');
    expect(code).toContain('workspaces:');
    expect(code).toMatch(/import.*SchemaType/);
  });

  it('should include proper imports', () => {
    const code = formatClientCode({ collections: [] });

    expect(code).toContain('import type { paths }');
    expect(code).toContain('import type { SchemaType }');
  });

  it('should add JSDoc comments', () => {
    const code = formatClientCode({ collections: [] });

    expect(code).toMatch(/\/\*\*/);
    expect(code).toContain('Generated client');
  });

  it('should handle multiple collections', () => {
    const mockStructure: ClientStructure = {
      collections: [
        { name: 'workspaces', type: 'collection', methods: [] },
        { name: 'workflows', type: 'collection', methods: [] },
        { name: 'executions', type: 'collection', methods: [] },
      ],
    };

    const code = formatClientCode(mockStructure);

    expect(code).toContain('workspaces:');
    expect(code).toContain('workflows:');
    expect(code).toContain('executions:');
  });

  it('should generate valid TypeScript syntax', () => {
    const mockStructure: ClientStructure = {
      collections: [{ name: 'workspaces', type: 'collection', methods: [] }],
    };

    const code = formatClientCode(mockStructure);

    // Check for complete function structure
    expect(code).toMatch(/export function createClient\([^)]+\)/);
    expect(code).toMatch(/return\s*{/);
    expect(code).toContain('};');
  });

  it('should properly indent code', () => {
    const mockStructure: ClientStructure = {
      collections: [{ name: 'workspaces', type: 'collection', methods: [] }],
    };

    const code = formatClientCode(mockStructure);

    // Check indentation levels
    expect(code).toMatch(/^\s{2}return\s*{/m); // 2 spaces for return
    expect(code).toMatch(/^\s{4}workspaces:/m); // 4 spaces for properties
  });
});
