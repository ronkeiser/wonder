#!/usr/bin/env tsx
/**
 * Debug script to test runtime behavior
 * Step 4: Test Runtime Behavior
 */

import { createClient } from '../src/generated/client.js';

console.log('=== Step 4: Test Runtime Behavior ===\n');

// Create mock base client
const mockCalls: any[] = [];

const mockClient = {
  GET: async (path: string, options: any) => {
    mockCalls.push({ method: 'GET', path, options });
    return { data: { id: '123', name: 'Test' } };
  },
  POST: async (path: string, options: any) => {
    mockCalls.push({ method: 'POST', path, options });
    return { data: { id: '456', name: 'Created' } };
  },
  PUT: async (path: string, options: any) => {
    mockCalls.push({ method: 'PUT', path, options });
    return { data: { id: '123', name: 'Updated' } };
  },
  PATCH: async (path: string, options: any) => {
    mockCalls.push({ method: 'PATCH', path, options });
    return { data: { id: '123', name: 'Patched' } };
  },
  DELETE: async (path: string, options: any) => {
    mockCalls.push({ method: 'DELETE', path, options });
    return { data: null };
  },
};

const client = createClient(mockClient);

console.log('TEST 1: Client structure');
console.log('  client.workspaces type:', typeof client.workspaces);
console.log('  client.workspaces is function:', typeof client.workspaces === 'function');
console.log('  client.workspaces.list type:', typeof client.workspaces.list);
console.log('  client.workspaces.create type:', typeof client.workspaces.create);
console.log();

console.log('TEST 2: Collection methods');
mockCalls.length = 0;

try {
  await client.workspaces.list();
  console.log('  ✓ list() called successfully');
  console.log('    Path:', mockCalls[0].path);
  console.log('    Method:', mockCalls[0].method);
} catch (error) {
  console.log('  ❌ list() failed:', error);
}

mockCalls.length = 0;

try {
  await client.workspaces.create({ name: 'New Workspace' });
  console.log('  ✓ create() called successfully');
  console.log('    Path:', mockCalls[0].path);
  console.log('    Method:', mockCalls[0].method);
  console.log('    Body:', mockCalls[0].options.body);
} catch (error) {
  console.log('  ❌ create() failed:', error);
}
console.log();

console.log('TEST 3: Instance access');
mockCalls.length = 0;

try {
  const instance = client.workspaces('ws-123');
  console.log('  ✓ Instance created');
  console.log('    instance.get type:', typeof instance.get);
  console.log('    instance.delete type:', typeof instance.delete);
  console.log('    instance.patch type:', typeof instance.patch);
} catch (error) {
  console.log('  ❌ Instance creation failed:', error);
}
console.log();

console.log('TEST 4: Instance methods');
mockCalls.length = 0;

try {
  await client.workspaces('ws-123').get();
  console.log('  ✓ get() called successfully');
  console.log('    Path:', mockCalls[0].path);
  console.log('    Method:', mockCalls[0].method);

  if (mockCalls[0].path === '/api/workspaces/ws-123') {
    console.log('    ✓ Path parameter interpolated correctly');
  } else {
    console.log('    ❌ Path parameter NOT interpolated correctly');
  }
} catch (error) {
  console.log('  ❌ get() failed:', error);
}

mockCalls.length = 0;

try {
  await client.workspaces('ws-456').patch({ name: 'Updated' });
  console.log('  ✓ patch() called successfully');
  console.log('    Path:', mockCalls[0].path);
  console.log('    Body:', mockCalls[0].options.body);
} catch (error) {
  console.log('  ❌ patch() failed:', error);
}

mockCalls.length = 0;

try {
  await client.workspaces('ws-789').delete();
  console.log('  ✓ delete() called successfully');
  console.log('    Path:', mockCalls[0].path);
} catch (error) {
  console.log('  ❌ delete() failed:', error);
}
console.log();

console.log('TEST 5: Action methods');
mockCalls.length = 0;

try {
  const workflowInstance = client.workflows('wf-123');
  console.log('  ✓ Workflow instance created');
  console.log('    instance.start type:', typeof workflowInstance.start);
} catch (error) {
  console.log('  ❌ Workflow instance creation failed:', error);
}

try {
  await client.workflows('wf-123').start({ force: true });
  console.log('  ✓ start() action called successfully');
  console.log('    Path:', mockCalls[0].path);
  console.log('    Method:', mockCalls[0].method);
  console.log('    Body:', mockCalls[0].options.body);

  if (mockCalls[0].path === '/api/workflows/wf-123/start') {
    console.log('    ✓ Action path constructed correctly');
  } else {
    console.log('    ❌ Action path NOT constructed correctly');
  }
} catch (error) {
  console.log('  ❌ start() failed:', error);
}
console.log();

console.log('TEST 6: Collections without instances (logs)');
mockCalls.length = 0;

try {
  console.log('  client.logs type:', typeof client.logs);
  console.log('  client.logs.list type:', typeof client.logs.list);

  await client.logs.list();
  console.log('  ✓ logs.list() called successfully');
  console.log('    Path:', mockCalls[0].path);
} catch (error) {
  console.log('  ❌ logs.list() failed:', error);
}
console.log();

// VALIDATION
console.log('=== Step 4 Complete ===');
console.log('Runtime tests completed. Check output above for failures.\n');
