import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

/**
 * Task 3.6: End-to-End Integration Test
 *
 * Run complete generation and verify output compiles and works.
 */

describe('End-to-end generation', () => {
  beforeAll(async () => {
    // Ensure we start with a clean generation
    try {
      await execAsync('pnpm tsx scripts/generate.ts', {
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error('Generation failed:', error);
      throw error;
    }
  }, 60000); // 60 second timeout

  it('should generate complete SDK without errors', async () => {
    const { stdout, stderr } = await execAsync('pnpm tsx scripts/generate.ts', {
      cwd: process.cwd(),
    });

    // Should not have errors (some info might go to stderr, so we check for success messages)
    expect(stdout).toContain('Generated types written');
    expect(stdout).toContain('Generated client written');
  });

  it('should create both output files', () => {
    const schemaPath = join(process.cwd(), 'src/generated/schema.d.ts');
    const clientPath = join(process.cwd(), 'src/generated/client.ts');

    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(clientPath)).toBe(true);
  });

  it('should produce code that compiles', async () => {
    const { stderr } = await execAsync('pnpm tsc --noEmit', {
      cwd: process.cwd(),
    });

    // TypeScript should compile without errors
    expect(stderr).toBe('');
  });

  it('should export createClient function', async () => {
    // Dynamic import to test the generated code
    const clientModule = await import('../src/generated/client.js');

    expect(clientModule).toHaveProperty('createClient');
    expect(typeof clientModule.createClient).toBe('function');
  });

  it('should create client with expected collections', async () => {
    const { createClient } = await import('../src/generated/client.js');
    const mockBaseClient = {} as any;
    const client = createClient(mockBaseClient);

    // Should have workspaces collection
    expect(client).toHaveProperty('workspaces');
    expect(typeof client.workspaces).toBe('object');
  });

  it('should have proper structure for all collections', async () => {
    const { createClient } = await import('../src/generated/client.js');
    const mockBaseClient = {} as any;
    const client = createClient(mockBaseClient);

    // Get all top-level properties
    const collections = Object.keys(client);

    // Should have multiple collections
    expect(collections.length).toBeGreaterThan(0);

    // Each collection should be an object
    collections.forEach((collectionName) => {
      expect(typeof client[collectionName as keyof typeof client]).toBe('object');
    });
  });

  it('should generate valid imports', async () => {
    const { readFileSync } = await import('node:fs');
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    // Check for required imports
    expect(content).toContain('import type { paths }');
    expect(content).toContain('import type { SchemaType }');
    expect(content).toContain("from './schema.js'");
    expect(content).toContain("from '@wonder/context'");
  });

  it('should have JSDoc documentation', async () => {
    const { readFileSync } = await import('node:fs');
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    // Check for JSDoc comments
    expect(content).toMatch(/\/\*\*/);
    expect(content).toContain('Generated client');
    expect(content).toContain('@param baseClient');
  });

  it('should match expected code structure', async () => {
    const { readFileSync } = await import('node:fs');
    const clientPath = join(process.cwd(), 'src/generated/client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    // Check for function declaration
    expect(content).toMatch(/export function createClient\(/);

    // Check for return statement
    expect(content).toContain('return {');

    // Check for closing
    expect(content).toMatch(/}\s*;\s*}$/m);
  });
});
