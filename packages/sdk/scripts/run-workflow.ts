#!/usr/bin/env node
/**
 * CLI script to run a workflow and stream events
 *
 * Usage:
 *   pnpm tsx scripts/run-workflow.ts --name "Your Name"
 *   pnpm tsx scripts/run-workflow.ts --name "Alice" --url "http://localhost:8787"
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
Usage: pnpm tsx scripts/run-workflow.ts [options]

Options:
  --name, -n <name>    Name to pass to the workflow (default: "CLI User")
  --url, -u <url>      API base URL (default: "https://wonder-http.ron-keiser.workers.dev")
  --help, -h           Show this help message

Examples:
  pnpm tsx scripts/run-workflow.ts --name "Alice"
  pnpm tsx scripts/run-workflow.ts --name "Bob" --url "http://localhost:8787"
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

  console.log(`Starting workflow...`);
  console.log(`  Name: ${name}`);
  console.log(`  API: ${baseUrl}`);
  console.log('');

  const client = new WonderfulClient(baseUrl);

  try {
    for await (const event of client.executeWorkflow({
      workflow_id: '01JDXSEED0000WORKFLOW0001',
      input: { name },
    })) {
      console.log(`[${event.kind}]`, JSON.stringify(event.payload, null, 2));
    }

    console.log('\n✓ Workflow completed successfully');

    // WebSocket keeps the event loop alive, so we must explicitly exit
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

main();
