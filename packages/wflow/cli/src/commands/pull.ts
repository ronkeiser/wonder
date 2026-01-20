/**
 * wflow pull command
 *
 * Pull definitions from the server to local workspace.
 */

import { createClient } from '@wonder/sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

interface PullOptions {
  force?: boolean;
  workspaceId?: string;
  apiUrl?: string;
  apiKey?: string;
  quiet?: boolean;
  color?: boolean;
}

interface PullResult {
  path: string;
  action: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
}

export const pullCommand = new Command('pull')
  .description('Pull definitions from the server to local workspace')
  .argument('[path]', 'Workspace directory to pull into', '.')
  .option('--force', 'Overwrite existing files without prompting')
  .option('--workspace-id <id>', 'Source workspace ID on the server')
  .option('--api-url <url>', 'API URL', process.env.RESOURCES_URL || 'https://api.wflow.app')
  .option('--api-key <key>', 'API key for authentication', process.env.WONDER_API_KEY)
  .option('--quiet', 'Minimal output')
  .option('--no-color', 'Disable colored output')
  .action(async (targetPath: string, options: PullOptions) => {
    try {
      await runPull(targetPath, options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

async function runPull(targetPath: string, options: PullOptions): Promise<void> {
  const resolved = path.resolve(targetPath);
  const c = getChalk(options);

  // Check API key
  if (!options.apiKey) {
    console.error('Error: API key required. Set WONDER_API_KEY or use --api-key');
    process.exit(1);
  }

  // Create target directory if it doesn't exist
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  if (!options.quiet) {
    console.log(`\n${c.bold('Pulling to workspace:')} ${resolved}\n`);
  }

  // Create API client
  const client = createClient(options.apiUrl, options.apiKey);

  // Fetch all definitions
  const results: PullResult[] = [];

  // Pull personas
  try {
    const { personas } = await client.personas.list();
    for (const persona of personas) {
      const result = await pullDefinition(
        resolved,
        'persona',
        persona.name,
        persona,
        options,
        c,
      );
      results.push(result);
    }
  } catch (error) {
    if (!options.quiet) {
      console.warn(c.yellow(`Warning: Could not fetch personas: ${error instanceof Error ? error.message : error}`));
    }
  }

  // Pull tools
  try {
    const { tools } = await client.tools.list();
    for (const tool of tools) {
      const result = await pullDefinition(
        resolved,
        'tool',
        tool.name,
        tool,
        options,
        c,
      );
      results.push(result);
    }
  } catch (error) {
    if (!options.quiet) {
      console.warn(c.yellow(`Warning: Could not fetch tools: ${error instanceof Error ? error.message : error}`));
    }
  }

  // Pull tasks
  try {
    const { tasks } = await client.tasks.list();
    for (const task of tasks) {
      const result = await pullDefinition(
        resolved,
        'task',
        task.name,
        task,
        options,
        c,
      );
      results.push(result);
    }
  } catch (error) {
    if (!options.quiet) {
      console.warn(c.yellow(`Warning: Could not fetch tasks: ${error instanceof Error ? error.message : error}`));
    }
  }

  // Pull workflow-defs
  try {
    // Fetch workflow-defs directly (SDK may not have list method)
    const url = new URL('/workflow-defs', options.apiUrl);
    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': options.apiKey! },
    });

    if (response.ok) {
      const { workflowDefs } = (await response.json()) as { workflowDefs: Array<{ name: string; [key: string]: unknown }> };
      for (const wfDef of workflowDefs) {
        const result = await pullDefinition(
          resolved,
          'wflow',
          wfDef.name,
          wfDef,
          options,
          c,
        );
        results.push(result);
      }
    }
  } catch (error) {
    if (!options.quiet) {
      console.warn(c.yellow(`Warning: Could not fetch workflow-defs: ${error instanceof Error ? error.message : error}`));
    }
  }

  // Report results
  reportResults(results, options, c);

  // Exit code
  const hasErrors = results.some((r) => r.action === 'error');
  process.exit(hasErrors ? 1 : 0);
}

async function pullDefinition(
  workspaceRoot: string,
  definitionType: 'persona' | 'tool' | 'task' | 'wflow',
  name: string,
  data: Record<string, unknown>,
  options: PullOptions,
  c: ReturnType<typeof getChalk>,
): Promise<PullResult> {
  // Determine file path based on type
  const ext = definitionType === 'wflow' ? 'wflow' : definitionType;
  const dir = getDirectoryForType(definitionType);
  const dirPath = path.join(workspaceRoot, dir);
  const filePath = path.join(dirPath, `${name}.${ext}`);

  // Check if file exists
  const exists = fs.existsSync(filePath);

  if (exists && !options.force) {
    if (!options.quiet) {
      console.log(`  ${c.yellow('○')} ${filePath} - skipped (already exists)`);
    }
    return {
      path: filePath,
      action: 'skipped',
      message: 'File already exists',
    };
  }

  try {
    // Ensure directory exists
    fs.mkdirSync(dirPath, { recursive: true });

    // Convert to YAML (snake_case)
    const yamlContent = toYaml(data, definitionType);

    // Write file
    fs.writeFileSync(filePath, yamlContent, 'utf-8');

    if (!options.quiet) {
      const icon = exists ? c.yellow('↺') : c.green('✓');
      const action = exists ? 'updated' : 'created';
      console.log(`  ${icon} ${filePath} - ${action}`);
    }

    return {
      path: filePath,
      action: exists ? 'updated' : 'created',
    };
  } catch (error) {
    if (!options.quiet) {
      console.log(`  ${c.red('✗')} ${filePath} - error: ${error instanceof Error ? error.message : error}`);
    }
    return {
      path: filePath,
      action: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function getDirectoryForType(definitionType: string): string {
  switch (definitionType) {
    case 'persona':
      return 'personas';
    case 'tool':
      return 'tools';
    case 'task':
      return 'tasks';
    case 'wflow':
      return 'workflows';
    default:
      return definitionType;
  }
}

/**
 * Convert camelCase keys to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively convert object keys from camelCase to snake_case
 */
function deepCamelToSnake<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepCamelToSnake) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Preserve special keys
      const newKey = key.startsWith('$') || key.startsWith('_') ? key : camelToSnake(key);
      result[newKey] = deepCamelToSnake(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Convert data to YAML format
 */
function toYaml(data: Record<string, unknown>, _definitionType: string): string {
  // Remove server-side fields
  const cleaned = { ...data };
  delete cleaned.id;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.contentHash;

  // Convert to snake_case
  const snakeCased = deepCamelToSnake(cleaned);

  // Stringify to YAML
  return stringifyYaml(snakeCased, { indent: 2 });
}

function reportResults(
  results: PullResult[],
  options: PullOptions,
  c: ReturnType<typeof getChalk>,
): void {
  if (options.quiet) return;

  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const errors = results.filter((r) => r.action === 'error').length;

  console.log();

  if (errors > 0) {
    console.log(
      c.red(
        `  Pull completed with errors: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
      ),
    );
  } else {
    console.log(
      c.green(`  Pull complete: ${created} created, ${updated} updated, ${skipped} skipped`),
    );
  }

  console.log();
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
