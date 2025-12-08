#!/usr/bin/env tsx
/**
 * Debug script to test path parser in isolation
 * Step 2: Test Path Parser
 */

import { readFileSync } from 'node:fs';
import {
  buildRouteTree,
  classifySegment,
  NodeType,
  parsePathSegments,
  type PathDefinition,
} from '../scripts/parse-paths.js';

function printTree(nodes: any[], indent = 0): void {
  const prefix = '  '.repeat(indent);
  for (const node of nodes) {
    const methods = node.methods.map((m: any) => m.verb.toUpperCase()).join(', ');
    console.log(
      `${prefix}${node.type === NodeType.Param ? ':' : ''}${node.name} [${node.type}]${methods ? ` {${methods}}` : ''}`,
    );
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

console.log('=== Step 2: Test Path Parser ===\n');

// Test 1.2: Path Segment Parser
console.log('TEST 1.2: Path Segment Parser');
const testPaths = [
  '/api/workspaces',
  '/api/workspaces/{id}',
  '/api/projects/{project_id}/workflows',
];

testPaths.forEach((path) => {
  const segments = parsePathSegments(path);
  console.log(`  ${path}`);
  console.log(`    → [${segments.map((s) => `'${s}'`).join(', ')}]`);
});
console.log();

// Test 1.3: Segment Classifier
console.log('TEST 1.3: Segment Classifier');
const testSegments = ['workspaces', '{id}', ':workspace_id', 'start'];
testSegments.forEach((segment) => {
  const type = classifySegment(segment);
  console.log(`  '${segment}' → ${type}`);
});
console.log();

// Test 1.4: Tree Builder - Simple mock data
console.log('TEST 1.4: Tree Builder - Mock Data');
const mockPaths: PathDefinition[] = [
  { path: '/api/workspaces', method: 'get' },
  { path: '/api/workspaces', method: 'post' },
  { path: '/api/workspaces/{id}', method: 'get' },
  { path: '/api/workspaces/{id}', method: 'patch' },
  { path: '/api/workspaces/{id}', method: 'delete' },
];

const mockTree = buildRouteTree(mockPaths);
console.log('\nMock tree structure:');
printTree(mockTree);
console.log();

// Test with action endpoint
console.log('TEST 1.4b: Tree Builder - With Action');
const actionPaths: PathDefinition[] = [
  { path: '/api/workflows', method: 'post' },
  { path: '/api/workflows/{id}', method: 'get' },
  { path: '/api/workflows/{id}/start', method: 'post' },
];

const actionTree = buildRouteTree(actionPaths);
console.log('\nAction tree structure:');
printTree(actionTree);
console.log();

// Test with real API paths
console.log('TEST 1.5: Tree Builder - Real API Paths');
console.log('Loading paths from spec...\n');

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

console.log(`Processing ${realPaths.length} path definitions...\n`);

const realTree = buildRouteTree(realPaths);

console.log('Real API tree structure:');
printTree(realTree);
console.log();

// Validation checks
console.log('VALIDATION CHECKS:');

// Check that collections exist
const collections = realTree.map((n) => n.name);
console.log(`  Root collections: ${collections.join(', ')}`);

// Check workspaces structure
const workspaces = realTree.find((n) => n.name === 'workspaces');
if (workspaces) {
  console.log(`  ✓ workspaces found`);
  console.log(`    - Methods: ${workspaces.methods.map((m) => m.verb).join(', ')}`);
  console.log(`    - Children: ${workspaces.children.length}`);

  const idParam = workspaces.children.find((n) => n.type === NodeType.Param);
  if (idParam) {
    console.log(`    - Has :id parameter: ${idParam.name}`);
    console.log(`      - Methods: ${idParam.methods.map((m) => m.verb).join(', ')}`);
  }
} else {
  console.log(`  ❌ workspaces not found`);
}

// Check workflows with action
const workflows = realTree.find((n) => n.name === 'workflows');
if (workflows) {
  console.log(`  ✓ workflows found`);
  const idParam = workflows.children.find((n) => n.type === NodeType.Param);
  if (idParam) {
    const startAction = idParam.children.find((n) => n.name === 'start');
    if (startAction) {
      console.log(`    - Has start action`);
      console.log(`      - Type: ${startAction.type}`);
      console.log(`      - Methods: ${startAction.methods.map((m) => m.verb).join(', ')}`);

      if (startAction.type === NodeType.Action) {
        console.log(`      ✓ Correctly classified as action`);
      } else {
        console.log(`      ❌ Should be action, is ${startAction.type}`);
      }
    } else {
      console.log(`    ❌ start action not found`);
    }
  }
}

// Check for param nodes
let paramCount = 0;
let actionCount = 0;
let collectionCount = 0;

function countNodes(nodes: any[]): void {
  for (const node of nodes) {
    if (node.type === NodeType.Param) paramCount++;
    else if (node.type === NodeType.Action) actionCount++;
    else if (node.type === NodeType.Collection) collectionCount++;

    if (node.children.length > 0) {
      countNodes(node.children);
    }
  }
}

countNodes(realTree);

console.log(`\n  Node counts:`);
console.log(`    Collections: ${collectionCount}`);
console.log(`    Parameters: ${paramCount}`);
console.log(`    Actions: ${actionCount}`);

// Expected: 8 collections at root (workspaces, projects, actions, prompt-specs, model-profiles, workflow-defs, workflows, logs)
// Expected: 1 action (workflows/{id}/start)
console.log(`\n  Expected root collections: 8`);
console.log(`  Actual root collections: ${realTree.length}`);

if (realTree.length === 8) {
  console.log(`  ✓ Correct number of root collections`);
} else {
  console.log(`  ❌ Wrong number of root collections`);
}

if (actionCount === 1) {
  console.log(`  ✓ Found 1 action endpoint`);
} else {
  console.log(`  ❌ Expected 1 action, found ${actionCount}`);
}

console.log('\n=== Step 2 Complete ===');
console.log(
  `Parser ${actionCount === 1 && realTree.length === 8 ? 'PASSED' : 'FAILED'} validation\n`,
);
