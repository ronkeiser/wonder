#!/usr/bin/env tsx
/**
 * Type safety demo for the Wonder SDK
 *
 * This demonstrates how the SDK provides full TypeScript type safety:
 * - Request body validation
 * - Response type inference
 * - Schema types from @wonder/context
 * - Compile-time error checking
 */

import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from '../src/generated/client.js';
import type { paths } from '../src/generated/schema.js';

const API_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

// Create clients
const baseClient = createClient<paths>({ baseUrl: API_URL });
const wonder = createWonderClient(baseClient);

async function typeDemo() {
  console.log('=== Wonder SDK Type Safety Demo ===\n');

  // ============================================
  // Type-safe requests
  // ============================================
  console.log('1. Type-safe request bodies:\n');

  // This compiles - valid workspace creation
  const createResponse = await wonder.workspaces.create({
    name: 'Type-safe Workspace',
    settings: { typed: true },
  });
  const validWorkspace = createResponse?.workspace;
  console.log('   ✓ Valid workspace created:', validWorkspace?.name);

  // Uncommenting this would cause a compile error:
  // const invalid = await wonder.workspaces.create({
  //   name: 'Test',
  //   invalidField: 'This does not exist in the schema'
  // });

  console.log();

  // ============================================
  // Type-safe responses
  // ============================================
  console.log('2. Type-safe response handling:\n');

  if (validWorkspace?.id) {
    // Response type is inferred from OpenAPI spec
    const getResponse = await wonder.workspaces(validWorkspace.id).get();
    const workspace = getResponse?.workspace;

    // These are typed and will autocomplete:
    console.log('   Workspace ID:', workspace?.id);
    console.log('   Workspace name:', workspace?.name);
    console.log('   Workspace settings:', workspace?.settings);

    // Uncommenting this would cause a compile error:
    // console.log('Invalid field:', workspace.nonExistent);

    console.log();
  }

  // ============================================
  // Schema types for workflows
  // ============================================
  console.log('3. Schema types for input/output:\n');

  // Workflows use SchemaType from @wonder/context
  const workflowCreateResponse = await wonder.workflows.create({
    project_id: 'demo-project',
    workflow_def_id: 'demo-def',
    name: 'Type-safe Workflow',
    description: 'Demonstrates type safety',
  });
  const workflow = workflowCreateResponse?.workflow;

  console.log('   ✓ Workflow created with typed input');

  if (workflow?.id) {
    const statusResponse = await wonder.workflows(workflow.id).get();
    const status = statusResponse?.workflow;
    console.log('   ✓ Workflow is typed:', typeof status?.name);
    console.log();
  }

  // ============================================
  // Type-safe collections
  // ============================================
  console.log('4. Type-safe collection methods:\n');

  // List returns array of typed items
  const workspacesResponse = await wonder.workspaces.list();
  const workspaces = workspacesResponse?.workspaces;

  if (workspaces && workspaces.length > 0) {
    // Each item is fully typed
    const first = workspaces[0];
    console.log('   First workspace:', first?.name);
    console.log('   Has typed fields:', 'id' in first, 'name' in first);
  }

  console.log();

  // ============================================
  // Type-safe actions
  // ============================================
  console.log('5. Type-safe action methods:\n');

  if (workflow?.id) {
    // Start action has typed input
    const result = await wonder.workflows(workflow.id).start({
      force: false, // Typed as boolean
    });

    console.log('   ✓ Action called with typed parameters');
    console.log('   Result:', result?.workflow_run_id);

    // Uncommenting this would cause a compile error:
    // await wonder.workflows(workflow.id).start({
    //   force: 'not a boolean' // Type error!
    // });
  }

  console.log();

  // ============================================
  // Type-safe error handling
  // ============================================
  console.log('6. Type-safe error handling:\n');

  try {
    // Attempting to get non-existent resource
    await wonder.workspaces('non-existent-id').get();
  } catch (error) {
    // Error types are inferred
    console.log('   ✓ Caught expected error');

    if (error && typeof error === 'object' && 'data' in error) {
      // API error details are typed
      console.log('   Error data available:', !!error.data);
    }
  }

  console.log();
  console.log('=== Type Safety Demo Complete ===\n');
  console.log('Key takeaways:');
  console.log('- All request bodies are validated at compile time');
  console.log('- Response types are inferred from OpenAPI spec');
  console.log('- IDE provides autocomplete for all fields');
  console.log('- Schema types work with complex nested data');
  console.log('- Refactoring is safe - compiler catches breaks\n');
}

// Run demo
typeDemo().catch(console.error);
