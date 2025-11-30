#!/usr/bin/env node
/**
 * E2E test: Create a project, workflow, run it, and clean up
 *
 * This test creates all its own data and cleans up afterward,
 * ensuring isolated test execution without seed data dependencies.
 *
 * Usage:
 *   pnpm --filter @wonder/e2e test --name "Your Name"
 *   pnpm --filter @wonder/e2e test --name "Alice" --url "http://localhost:8787"
 */

import { WonderfulClient } from '@wonder/sdk';

interface Args {
  name?: string;
  url?: string;
  help?: boolean;
}

function parseArgs(): Args {
  const args: Args = {};

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--name' || arg === '-n') {
      args.name = process.argv[++i];
    } else if (arg === '--url' || arg === '-u') {
      args.url = process.argv[++i];
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage: pnpm --filter @wonder/e2e test [options]

Options:
  --name, -n <name>    Name to pass to the workflow (default: "CLI User")
  --url, -u <url>      API base URL (default: "https://wonder-http.ron-keiser.workers.dev")
  --help, -h           Show this help message

Examples:
  pnpm --filter @wonder/e2e test --name "Alice"
  pnpm --filter @wonder/e2e test --name "Bob" --url "http://localhost:8787"
`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const name = args.name || 'CLI User';
  const baseUrl = args.url || 'https://wonder-http.ron-keiser.workers.dev';

  console.log(`E2E Test: Create → Run → Clean up`);
  console.log(`  Name: ${name}`);
  console.log(`  API: ${baseUrl}`);
  console.log('');

  const client = new WonderfulClient(baseUrl);
  let workspaceId: string | undefined;
  let projectId: string | undefined;

  try {
    // Step 1: Create test workspace
    console.log('🌍 Creating test workspace...');
    const { workspace_id } = await client.workspaces.create({
      name: `E2E Test Workspace ${Date.now()}`,
    });
    workspaceId = workspace_id;
    console.log(`  ✓ Created workspace: ${workspace_id}`);

    // Step 2: Get seed model profile (we still use seed data for model profiles)
    console.log('\n📋 Fetching model profiles...');
    const { profiles } = await client.modelProfiles.list({ provider: 'cloudflare' });
    const modelProfile = profiles.find((p) => p.model_id === '@cf/meta/llama-3-8b-instruct');
    if (!modelProfile) {
      throw new Error('Seed model profile not found');
    }
    console.log(`  ✓ Using model profile: ${modelProfile.name}`);

    // Step 3: Create test project
    console.log('\n🏗️  Creating test project...');
    const { project_id } = await client.projects.create({
      workspace_id,
      name: `E2E Test ${Date.now()}`,
      description: 'Temporary project for E2E testing',
    });
    projectId = project_id;
    console.log(`  ✓ Created project: ${project_id}`);

    // Step 4: Create prompt spec
    console.log('\n📝 Creating prompt spec...');
    const { prompt_spec_id } = await client.promptSpecs.create({
      name: 'Hello Greeting',
      description: 'A friendly greeting prompt',
      template_language: 'handlebars',
      template: 'Say hello to {{name}}',
    });
    console.log(`  ✓ Created prompt spec: ${prompt_spec_id}`);

    // Step 5: Create LLM action
    console.log('\n⚡ Creating action...');
    const { action_id } = await client.actions.create({
      name: 'Generate Greeting',
      action_kind: 'llm_call',
      config: {
        prompt_spec_id,
        model_profile_id: modelProfile.id,
        response_schema: {
          type: 'object',
          properties: {
            greeting: { type: 'string' },
          },
          required: ['greeting'],
        },
      },
    });
    console.log(`  ✓ Created action: ${action_id}`);

    // Step 6: Create workflow definition
    console.log('\n🔀 Creating workflow definition...');
    const { workflow_def_id } = await client.workflowDefs.create({
      owner: 'e2e_test',
      name: 'E2E Test Workflow',
      description: 'Temporary workflow for E2E testing',
      nodes: [
        {
          local_id: 'greet',
          action_id,
          produces: { greeting: 'string' },
        },
      ],
      transitions: [],
    });
    console.log(`  ✓ Created workflow def: ${workflow_def_id}`);

    // Step 7: Create workflow binding
    console.log('\n🔗 Creating workflow binding...');
    const { workflow_id } = await client.workflows.create({
      project_id,
      workflow_def_id,
      name: 'E2E Test Workflow Instance',
      description: 'Temporary workflow instance for testing',
    });
    console.log(`  ✓ Created workflow: ${workflow_id}`);

    // Step 8: Run workflow and stream events
    console.log('\n▶️  Starting workflow execution...\n');
    for await (const event of client.workflows.execute({
      workflow_id,
      input: { name },
    })) {
      console.log(`[${event.kind}]`, JSON.stringify(event.payload, null, 2));
    }

    console.log('\n✓ Workflow completed successfully');
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  } finally {
    // Step 9: Clean up - delete workspace (cascades to projects and all related data)
    if (workspaceId) {
      console.log('\n🧹 Cleaning up...');
      try {
        await client.workspaces.delete(workspaceId);
        console.log(`  ✓ Deleted workspace: ${workspaceId}`);
      } catch (error) {
        console.error('  ✗ Failed to clean up:', error);
      }
    }

    // WebSocket keeps the event loop alive, so we must explicitly exit
    process.exit(0);
  }
}

main();
