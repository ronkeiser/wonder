#!/usr/bin/env tsx
/**
 * Debug script to test code generator in isolation
 * Step 3: Test Code Generator
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildPathTemplate,
  formatClientCode,
  generateCollectionObject,
  generateMethodSignature,
  generateRootClient,
  getMethodName,
} from '../scripts/generate-client.js';
import { buildRouteTree, NodeType, type PathDefinition } from '../scripts/parse-paths.js';

console.log('=== Step 3: Test Code Generator ===\n');

// Load the parsed tree from Step 2
const spec = JSON.parse(readFileSync('debug/debug-spec-output.json', 'utf-8'));

const realPaths: PathDefinition[] = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(methods as any)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      realPaths.push({
        path,
        method: method as any,
        operationId: (operation as any)?.operationId,
      });
    }
  }
}

const routeTree = buildRouteTree(realPaths);

// TEST 2.1: HTTP Verb Mapping
console.log('TEST 2.1: HTTP Verb Mapping');

const workspaces = routeTree.find((n) => n.name === 'workspaces')!;
const workspacesId = workspaces.children[0];

console.log('  Collection POST → ', getMethodName(workspaces, 'post'));
console.log('  Collection GET → ', getMethodName(workspaces, 'get'));
console.log('  Instance GET → ', getMethodName(workspacesId, 'get'));
console.log('  Instance PUT → ', getMethodName(workspacesId, 'put'));
console.log('  Instance DELETE → ', getMethodName(workspacesId, 'delete'));

const workflows = routeTree.find((n) => n.name === 'workflows')!;
const workflowsId = workflows.children[0];
const startAction = workflowsId.children[0];

console.log('  Action POST → ', getMethodName(startAction, 'post'));
console.log();

// TEST 2.2: Path Template Builder
console.log('TEST 2.2: Path Template Builder');

console.log('  workspaces:', buildPathTemplate(workspaces));
console.log('  workspaces/{id}:', buildPathTemplate(workspacesId));
console.log('  workflows/{id}/start:', buildPathTemplate(startAction));
console.log();

// TEST 2.3: Method Signature Generator
console.log('TEST 2.3: Method Signature Generator');

const createSig = generateMethodSignature(workspaces, 'post');
console.log('  create signature:', JSON.stringify(createSig, null, 2));

const getSig = generateMethodSignature(workspacesId, 'get');
console.log('  get signature:', JSON.stringify(getSig, null, 2));

const startSig = generateMethodSignature(startAction, 'post');
console.log('  start signature:', JSON.stringify(startSig, null, 2));
console.log();

// TEST 2.4: Collection Object Generator
console.log('TEST 2.4: Collection Object Generator');

const workspacesObj = generateCollectionObject(workspaces);
console.log('  Workspaces structure:');
console.log(JSON.stringify(workspacesObj, null, 2).split('\n').slice(0, 20).join('\n'));
console.log('  ...');
console.log();

// TEST 2.6: Root Client Generator
console.log('TEST 2.6: Root Client Generator');

const clientStructure = generateRootClient(routeTree);
console.log(`  Generated ${clientStructure.collections.length} root collections`);
console.log('  Collections:', clientStructure.collections.map((c) => c.name).join(', '));
console.log();

// TEST 3.4: Client Code Formatting
console.log('TEST 3.4: Client Code Formatting');

const clientCode = formatClientCode(clientStructure);
console.log('  Generated code preview (first 30 lines):');
console.log(
  clientCode
    .split('\n')
    .slice(0, 30)
    .map((line) => `  | ${line}`)
    .join('\n'),
);
console.log('  ...\n');

// Write to temp file for inspection
writeFileSync('debug/generated-client-test.ts', clientCode, 'utf-8');
console.log('✓ Full generated code written to debug/generated-client-test.ts\n');

// VALIDATION CHECKS
console.log('VALIDATION CHECKS:');

// Check code structure
const hasImports = clientCode.includes('import type { paths }');
const hasSchemaImport = clientCode.includes('import type { JSONSchema }');
const hasCreateClient = clientCode.includes('export function createClient');
const hasReturn = clientCode.includes('return {');

console.log(`  ✓ Has type imports: ${hasImports}`);
console.log(`  ✓ Has JSONSchema import: ${hasSchemaImport}`);
console.log(`  ✓ Has createClient function: ${hasCreateClient}`);
console.log(`  ✓ Has return statement: ${hasReturn}`);

// Check for all collections
const missingCollections: string[] = [];
const expectedCollections = [
  'workspaces',
  'projects',
  'actions',
  'prompt-specs',
  'model-profiles',
  'workflow-defs',
  'workflows',
  'logs',
];

for (const collection of expectedCollections) {
  if (!clientCode.includes(`${collection}:`)) {
    missingCollections.push(collection);
  }
}

if (missingCollections.length === 0) {
  console.log('  ✓ All 8 collections present in generated code');
} else {
  console.log(`  ❌ Missing collections: ${missingCollections.join(', ')}`);
}

// Check code compiles
console.log('\n  Attempting TypeScript compilation...');
try {
  const { execSync } = await import('child_process');
  execSync('pnpm tsc --noEmit debug/generated-client-test.ts', {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
  console.log('  ✓ Generated code compiles without errors');
} catch (error: any) {
  console.log('  ❌ Compilation failed:');
  console.log(error.stdout?.toString() || error.stderr?.toString() || error.message);
}

console.log('\n=== Step 3 Complete ===');

const allChecks =
  hasImports && hasSchemaImport && hasCreateClient && hasReturn && missingCollections.length === 0;

console.log(`Code generation ${allChecks ? 'PASSED' : 'FAILED'} validation\n`);
