#!/usr/bin/env tsx
/**
 * Basic usage demo of the Wonder SDK
 *
 * This demonstrates the ergonomic API generated from the OpenAPI spec:
 * - Collection methods: list, create
 * - Instance methods: get, update, delete
 * - Action methods: start
 * - Nested resources
 */

import createClient from 'openapi-fetch';
import { createClient as createWonderClient } from '../src/generated/client.js';
import type { paths } from '../src/generated/schema.js';

const API_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

// Create base HTTP client
const baseClient = createClient<paths>({ baseUrl: API_URL });

// Create Wonder client with ergonomic API
const wonder = createWonderClient(baseClient);

async function demo() {
  console.log('=== Wonder SDK Demo ===\n');

  try {
    // ============================================
    // COLLECTIONS: List and Create
    // ============================================
    console.log('1. Working with collections:\n');

    console.log('   Listing workspaces...');
    const workspacesResponse = await wonder.workspaces.list();
    console.log(`   Found ${workspacesResponse?.workspaces?.length || 0} workspaces\n`);

    console.log('   Creating a new workspace...');
    const createResponse = await wonder.workspaces.create({
      name: 'Demo Workspace',
      settings: { demo: true },
    });
    const newWorkspace = createResponse?.workspace;
    console.log(`   Created: ${newWorkspace?.name} (${newWorkspace?.id})\n`);

    // ============================================
    // INSTANCES: Get, Update, Delete
    // ============================================
    console.log('2. Working with instances:\n');

    if (newWorkspace?.id) {
      console.log(`   Getting workspace ${newWorkspace.id}...`);
      const workspaceResponse = await wonder.workspaces(newWorkspace.id).get();
      console.log(`   Retrieved: ${workspaceResponse?.workspace?.name}\n`);

      console.log(`   Updating workspace...`);
      const updatedResponse = await wonder.workspaces(newWorkspace.id).patch({
        name: 'Updated Demo Workspace',
      });
      console.log(`   Updated: ${updatedResponse?.workspace?.name}\n`);

      console.log(`   Deleting workspace...`);
      await wonder.workspaces(newWorkspace.id).delete();
      console.log('   Deleted successfully\n');
    }

    // ============================================
    // WORKFLOWS: Create and Start Action
    // ============================================
    console.log('3. Working with workflows and actions:\n');

    console.log('   Creating a workflow...');
    const workflowCreateResponse = await wonder.workflows.create({
      project_id: 'demo-project',
      workflow_def_id: 'demo-workflow-def',
      name: 'Demo Workflow',
    });
    const workflow = workflowCreateResponse?.workflow;
    console.log(`   Created: ${workflow?.id}\n`);

    if (workflow?.id) {
      console.log('   Starting workflow (action method)...');
      const result = await wonder.workflows(workflow.id).start({
        force: false,
      });
      console.log(`   Started: ${result?.workflow_run_id || 'running'}\n`);

      console.log('   Getting workflow status...');
      const statusResponse = await wonder.workflows(workflow.id).get();
      console.log(`   Status: ${statusResponse?.workflow?.name || 'unknown'}\n`);
    }

    // ============================================
    // OTHER RESOURCES
    // ============================================
    console.log('4. Working with other resources:\n');

    console.log('   Listing model profiles...');
    const profilesResponse = await wonder['model-profiles'].list();
    console.log(`   Found ${profilesResponse?.model_profiles?.length || 0} model profiles\n`);

    console.log('   Listing logs...');
    const logs = await wonder.logs.list();
    console.log(`   Found ${logs?.length || 0} log entries\n`);

    console.log('=== Demo Complete ===\n');
  } catch (error) {
    console.error('Error:', error);
    if (error && typeof error === 'object' && 'data' in error) {
      console.error('API Error:', error.data);
    }
  }
}

// Run demo
demo();
