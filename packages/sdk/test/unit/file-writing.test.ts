import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

/**
 * Task 3.5: File Writing
 *
 * Verify that generated files are written correctly.
 */

describe('File writing', () => {
  beforeAll(async () => {
    // Run generation before tests
    try {
      await execAsync('pnpm tsx scripts/generate.ts', {
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error('Generation failed:', error);
      throw error;
    }
  }, 60000); // 60 second timeout for generation

  it('should write schema.d.ts to generated directory', () => {
    const schemaPath = join(process.cwd(), 'src/generated/schema.d.ts');
    expect(existsSync(schemaPath)).toBe(true);
  });

  it('should write client.ts to generated directory', () => {
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    expect(existsSync(clientPath)).toBe(true);
  });

  it('should write valid TypeScript in client.ts', () => {
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    expect(content).toContain('export function createClient');
    expect(content).toMatch(/import.*paths/);
  });

  it('should include JSDoc comments in client.ts', () => {
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    expect(content).toMatch(/\/\*\*/);
    expect(content).toContain('Generated client');
  });

  it('should have proper file structure', () => {
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    // Check for complete function structure
    expect(content).toMatch(/export function createClient\(/);
    expect(content).toContain('return {');
    expect(content).toContain('};');
  });

  it('should include at least one collection in client.ts', () => {
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    // Should have at least one property in the return object
    // Look for pattern like "workspaces:" or similar collection name
    expect(content).toMatch(/\w+:\s*{/);
  });
});
