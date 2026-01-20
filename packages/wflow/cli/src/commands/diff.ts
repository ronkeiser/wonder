/**
 * wflow diff command
 *
 * Compare local workspace definitions with server state.
 */

import {
  formatReference,
  type WorkspaceDefinition,
} from '@wonder/wflow';
import { createClient, type WonderClient } from '@wonder/sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isWorkspaceRoot, loadWorkspace } from '../workspace/loader';

interface DiffOptions {
  format?: 'pretty' | 'json';
  workspaceId?: string;
  apiUrl?: string;
  apiKey?: string;
  color?: boolean;
}

interface DiffEntry {
  reference: string;
  definitionType: string;
  status: 'local-only' | 'server-only' | 'modified' | 'unchanged';
  localHash?: string;
  serverHash?: string;
}

interface DiffResult {
  localOnly: DiffEntry[];
  serverOnly: DiffEntry[];
  modified: DiffEntry[];
  unchanged: DiffEntry[];
}

export const diffCommand = new Command('diff')
  .description('Compare local workspace definitions with server')
  .argument('[path]', 'Workspace directory to compare', '.')
  .option('--format <format>', 'Output format: pretty or json', 'pretty')
  .option('--workspace-id <id>', 'Target workspace ID on the server')
  .option('--api-url <url>', 'API URL', process.env.RESOURCES_URL || 'https://api.wflow.app')
  .option('--api-key <key>', 'API key for authentication', process.env.WONDER_API_KEY)
  .option('--no-color', 'Disable colored output')
  .action(async (targetPath: string, options: DiffOptions) => {
    try {
      await runDiff(targetPath, options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

async function runDiff(targetPath: string, options: DiffOptions): Promise<void> {
  const resolved = path.resolve(targetPath);
  const c = getChalk(options);

  // Verify workspace
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error(`Error: ${targetPath} is not a directory`);
    process.exit(1);
  }

  const isWorkspace = await isWorkspaceRoot(resolved);
  if (!isWorkspace) {
    console.error(`Error: ${targetPath} is not a workspace directory`);
    console.error(
      'A workspace must have wflow.config.yaml or one of: personas/, agents/, libraries/, projects/',
    );
    process.exit(1);
  }

  // Check API key
  if (!options.apiKey) {
    console.error('Error: API key required. Set WONDER_API_KEY or use --api-key');
    process.exit(1);
  }

  if (options.format !== 'json') {
    console.log(`\n${c.bold('Comparing workspace:')} ${resolved}\n`);
  }

  // Load local workspace
  const workspace = await loadWorkspace(resolved);

  // Fetch server state
  const client = createClient(options.apiUrl, options.apiKey);
  const serverDefinitions = await fetchServerDefinitions(client, options);

  // Build diff
  const result = computeDiff(workspace.definitions, serverDefinitions);

  // Output
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printPrettyDiff(result, c);
  }

  // Exit code: 0 if no differences, 1 if differences exist
  const hasDifferences =
    result.localOnly.length > 0 ||
    result.serverOnly.length > 0 ||
    result.modified.length > 0;

  process.exit(hasDifferences ? 1 : 0);
}

interface ServerDefinition {
  reference: string;
  definitionType: string;
  contentHash: string | null;
}

async function fetchServerDefinitions(
  client: WonderClient,
  options: DiffOptions,
): Promise<Map<string, ServerDefinition>> {
  const definitions = new Map<string, ServerDefinition>();

  // Fetch personas
  try {
    const { personas } = await client.personas.list();
    for (const persona of personas) {
      const ref = persona.libraryId
        ? `${persona.libraryId}/${persona.name}`
        : persona.name;
      definitions.set(`persona:${ref}`, {
        reference: ref,
        definitionType: 'persona',
        contentHash: persona.contentHash,
      });
    }
  } catch {
    // Ignore errors - server may not have personas
  }

  // Fetch tools (tools don't have contentHash)
  try {
    const { tools } = await client.tools.list();
    for (const tool of tools) {
      const ref = tool.libraryId
        ? `${tool.libraryId}/${tool.name}`
        : tool.name;
      definitions.set(`tool:${ref}`, {
        reference: ref,
        definitionType: 'tool',
        contentHash: null, // Tools don't support content hashing
      });
    }
  } catch {
    // Ignore errors
  }

  // Fetch tasks
  try {
    const { tasks } = await client.tasks.list();
    for (const task of tasks) {
      let ref = task.name;
      if (task.projectId) {
        ref = `@${task.projectId}/${task.name}`;
      } else if (task.libraryId) {
        ref = `${task.libraryId}/${task.name}`;
      }
      definitions.set(`task:${ref}`, {
        reference: ref,
        definitionType: 'task',
        contentHash: task.contentHash,
      });
    }
  } catch {
    // Ignore errors
  }

  // Fetch workflow-defs
  try {
    const url = new URL('/workflow-defs', options.apiUrl);
    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': options.apiKey! },
    });

    if (response.ok) {
      const { workflowDefs } = (await response.json()) as {
        workflowDefs: Array<{
          name: string;
          libraryId: string | null;
          projectId: string | null;
          contentHash: string | null;
        }>;
      };

      for (const wfDef of workflowDefs) {
        let ref = wfDef.name;
        if (wfDef.projectId) {
          ref = `@${wfDef.projectId}/${wfDef.name}`;
        } else if (wfDef.libraryId) {
          ref = `${wfDef.libraryId}/${wfDef.name}`;
        }
        definitions.set(`workflow:${ref}`, {
          reference: ref,
          definitionType: 'workflow',
          contentHash: wfDef.contentHash,
        });
      }
    }
  } catch {
    // Ignore errors
  }

  return definitions;
}

function computeDiff(
  local: Map<string, WorkspaceDefinition>,
  server: Map<string, ServerDefinition>,
): DiffResult {
  const result: DiffResult = {
    localOnly: [],
    serverOnly: [],
    modified: [],
    unchanged: [],
  };

  // Build a key for each local definition
  const localKeys = new Map<string, WorkspaceDefinition>();
  for (const [, def] of local) {
    const key = `${def.definitionType}:${formatReference(def.reference)}`;
    localKeys.set(key, def);
  }

  // Compare local to server
  for (const [key, def] of localKeys) {
    const serverDef = server.get(key);
    const refStr = formatReference(def.reference);

    if (!serverDef) {
      result.localOnly.push({
        reference: refStr,
        definitionType: def.definitionType,
        status: 'local-only',
        localHash: def.contentHash,
      });
    } else if (serverDef.contentHash !== def.contentHash) {
      result.modified.push({
        reference: refStr,
        definitionType: def.definitionType,
        status: 'modified',
        localHash: def.contentHash,
        serverHash: serverDef.contentHash ?? undefined,
      });
    } else {
      result.unchanged.push({
        reference: refStr,
        definitionType: def.definitionType,
        status: 'unchanged',
        localHash: def.contentHash,
        serverHash: serverDef.contentHash ?? undefined,
      });
    }
  }

  // Find server-only definitions
  for (const [key, serverDef] of server) {
    if (!localKeys.has(key)) {
      result.serverOnly.push({
        reference: serverDef.reference,
        definitionType: serverDef.definitionType,
        status: 'server-only',
        serverHash: serverDef.contentHash ?? undefined,
      });
    }
  }

  return result;
}

function printPrettyDiff(result: DiffResult, c: ReturnType<typeof getChalk>): void {
  const total =
    result.localOnly.length +
    result.serverOnly.length +
    result.modified.length +
    result.unchanged.length;

  if (total === 0) {
    console.log('  No definitions found\n');
    return;
  }

  // Local-only (new)
  if (result.localOnly.length > 0) {
    console.log(c.green(`  Local only (${result.localOnly.length}):`));
    for (const entry of result.localOnly) {
      console.log(`    ${c.green('+')} ${entry.reference} (${entry.definitionType})`);
    }
    console.log();
  }

  // Server-only (to be deleted or missing locally)
  if (result.serverOnly.length > 0) {
    console.log(c.red(`  Server only (${result.serverOnly.length}):`));
    for (const entry of result.serverOnly) {
      console.log(`    ${c.red('-')} ${entry.reference} (${entry.definitionType})`);
    }
    console.log();
  }

  // Modified
  if (result.modified.length > 0) {
    console.log(c.yellow(`  Modified (${result.modified.length}):`));
    for (const entry of result.modified) {
      console.log(`    ${c.yellow('~')} ${entry.reference} (${entry.definitionType})`);
    }
    console.log();
  }

  // Summary
  const unchanged = result.unchanged.length;
  const changed = result.localOnly.length + result.serverOnly.length + result.modified.length;

  if (changed === 0) {
    console.log(c.green(`  ✓ No changes detected (${unchanged} definitions match)\n`));
  } else {
    console.log(
      `  ${c.bold('Summary:')} ${c.green(`+${result.localOnly.length}`)} ` +
        `${c.red(`-${result.serverOnly.length}`)} ` +
        `${c.yellow(`~${result.modified.length}`)} ` +
        `(${unchanged} unchanged)\n`,
    );
  }
}

function getChalk(options: { color?: boolean }) {
  if (options.color === false) {
    return {
      red: (s: string) => s,
      yellow: (s: string) => s,
      green: (s: string) => s,
      gray: (s: string) => s,
      cyan: (s: string) => s,
      bold: (s: string) => s,
    };
  }
  return chalk;
}
