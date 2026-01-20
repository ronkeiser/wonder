/**
 * wflow deploy command
 *
 * Deploy workspace definitions to the server in topological order.
 * Supports idempotent deployment via content hashing.
 */

import {
  formatReference,
  getDeployOrder,
  STANDARD_LIBRARY_WORKSPACE_NAME,
  validateWorkspace,
  type Reference,
  type StandardLibraryManifest,
  type Workspace,
  type WorkspaceDefinition,
} from '@wonder/wflow';
import { createClient, type WonderClient } from '@wonder/sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isWorkspaceRoot, loadWorkspace } from '../workspace/loader';

interface DeployOptions {
  dryRun?: boolean;
  force?: boolean;
  workspaceId?: string;
  apiUrl?: string;
  apiKey?: string;
  quiet?: boolean;
  color?: boolean;
}

interface DeployResult {
  definition: WorkspaceDefinition;
  action: 'created' | 'updated' | 'skipped' | 'error';
  serverId?: string;
  message?: string;
}

export const deployCommand = new Command('deploy')
  .description('Deploy workspace definitions to the server')
  .argument('[path]', 'Workspace directory to deploy', '.')
  .option('--dry-run', 'Show what would be deployed without making changes')
  .option('--force', 'Deploy all definitions, even if unchanged')
  .option('--workspace-id <id>', 'Target workspace ID on the server')
  .option('--api-url <url>', 'API URL', process.env.RESOURCES_URL || 'https://api.wflow.app')
  .option('--api-key <key>', 'API key for authentication', process.env.WONDER_API_KEY)
  .option('--quiet', 'Minimal output')
  .option('--no-color', 'Disable colored output')
  .action(async (targetPath: string, options: DeployOptions) => {
    try {
      await runDeploy(targetPath, options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(2);
    }
  });

async function runDeploy(targetPath: string, options: DeployOptions): Promise<void> {
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
  if (!options.apiKey && !options.dryRun) {
    console.error('Error: API key required. Set WONDER_API_KEY or use --api-key');
    process.exit(1);
  }

  if (!options.quiet) {
    console.log(`\n${c.bold('Deploying workspace:')} ${resolved}\n`);
    if (options.dryRun) {
      console.log(c.yellow('  [DRY RUN] No changes will be made\n'));
    }
  }

  // Load workspace
  const workspace = await loadWorkspace(resolved);

  if (workspace.definitions.size === 0) {
    console.log('No definitions found in workspace');
    process.exit(0);
  }

  // Fetch standard library manifest for validation
  let standardLibrary: StandardLibraryManifest | undefined;
  if (options.apiUrl && options.apiKey) {
    try {
      standardLibrary = await fetchStandardLibraryManifest(options.apiUrl, options.apiKey);
    } catch (error) {
      if (!options.quiet) {
        console.warn(
          c.yellow(
            `Warning: Could not fetch standard library manifest: ${error instanceof Error ? error.message : error}`,
          ),
        );
      }
    }
  }

  // Validate workspace
  const validation = validateWorkspace(workspace, standardLibrary);

  if (!validation.valid) {
    console.error(c.red('\nWorkspace validation failed:\n'));
    for (const [filePath, diagnostics] of validation.diagnosticsByFile) {
      console.error(`  ${filePath}`);
      for (const diag of diagnostics) {
        console.error(`    ${c.red('✗')} ${diag.message}`);
      }
    }
    process.exit(1);
  }

  // Get topological deploy order
  const deployOrder = getDeployOrder(workspace, validation);

  if (!options.quiet) {
    console.log(`  Found ${deployOrder.length} definitions to deploy\n`);
  }

  // Deploy!
  const results = await deployDefinitions(deployOrder, workspace, options, c);

  // Report results
  reportResults(results, options, c);

  // Exit code
  const hasErrors = results.some((r) => r.action === 'error');
  process.exit(hasErrors ? 1 : 0);
}

async function deployDefinitions(
  deployOrder: WorkspaceDefinition[],
  workspace: Workspace,
  options: DeployOptions,
  c: ReturnType<typeof getChalk>,
): Promise<DeployResult[]> {
  const results: DeployResult[] = [];
  const isStandardLibrary = workspace.config?.name === STANDARD_LIBRARY_WORKSPACE_NAME;

  if (options.dryRun) {
    // Dry run - just show what would be deployed
    for (const def of deployOrder) {
      results.push({
        definition: def,
        action: 'skipped',
        message: 'Would deploy (dry run)',
      });
      if (!options.quiet) {
        const refStr = formatReference(def.reference);
        console.log(`  ${c.cyan('○')} ${refStr} (${def.definitionType})`);
      }
    }
    return results;
  }

  // Create API client
  const client = createClient(options.apiUrl, options.apiKey);

  // Track server IDs for references (includes library IDs)
  const serverIds = new Map<string, string>();

  // For standard library, ensure libraries exist first
  if (isStandardLibrary) {
    const libraryNames = new Set<string>();
    for (const def of deployOrder) {
      if (def.reference.scope === 'standardLibrary') {
        libraryNames.add(def.reference.library);
      }
    }

    for (const libraryName of libraryNames) {
      try {
        const libraryId = await ensureStandardLibrary(client, libraryName, options);
        serverIds.set(`library:${libraryName}`, libraryId);
        if (!options.quiet) {
          console.log(`  ${c.green('✓')} library/${libraryName} - ensured`);
        }
      } catch (error) {
        if (!options.quiet) {
          console.log(`  ${c.red('✗')} library/${libraryName} - error: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  }

  for (const def of deployOrder) {
    const refStr = formatReference(def.reference);

    try {
      const result = await deployDefinition(def, client, serverIds, options, isStandardLibrary);
      results.push(result);

      if (result.serverId) {
        serverIds.set(refStr, result.serverId);
      }

      if (!options.quiet) {
        const icon =
          result.action === 'created'
            ? c.green('✓')
            : result.action === 'updated'
              ? c.yellow('↺')
              : c.gray('○');
        console.log(`  ${icon} ${refStr} (${def.definitionType}) - ${result.action}`);
      }
    } catch (error) {
      results.push({
        definition: def,
        action: 'error',
        message: error instanceof Error ? error.message : String(error),
      });

      if (!options.quiet) {
        console.log(`  ${c.red('✗')} ${refStr} - error: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  return results;
}

/**
 * Ensure a standard library exists (with workspaceId: null)
 * Returns the library ID
 */
async function ensureStandardLibrary(
  client: WonderClient,
  name: string,
  _options: DeployOptions,
): Promise<string> {
  // Try to find existing library
  const { libraries } = await client.libraries.list();
  const existing = libraries.find((lib) => lib.name === name && lib.workspaceId === null);

  if (existing) {
    return existing.id;
  }

  // Create new standard library (workspaceId: null makes it standard)
  const result = await client.libraries.create({ name });
  return result.libraryId;
}

async function deployDefinition(
  def: WorkspaceDefinition,
  client: WonderClient,
  serverIds: Map<string, string>,
  options: DeployOptions,
  isStandardLibrary: boolean,
): Promise<DeployResult> {
  // Check if definition already exists on server
  const existing = await findExistingDefinition(def, client, serverIds, options);

  if (existing && !options.force) {
    // Check if content hash matches
    if (existing.contentHash === def.contentHash) {
      return {
        definition: def,
        action: 'skipped',
        serverId: existing.id,
        message: 'Content unchanged',
      };
    }
  }

  // Create or update
  const serverId = await createDefinition(def, client, serverIds, options, isStandardLibrary);

  return {
    definition: def,
    action: existing ? 'updated' : 'created',
    serverId,
  };
}

async function findExistingDefinition(
  def: WorkspaceDefinition,
  client: WonderClient,
  serverIds: Map<string, string>,
  options: DeployOptions,
): Promise<{ id: string; contentHash: string | null } | null> {
  const { reference, definitionType } = def;

  try {
    let result: { data?: unknown; error?: unknown };

    // Use GET with query params to find by name
    const name = getName(reference);
    const libraryId = getLibraryId(reference, serverIds) ?? undefined;
    const projectId = getProjectId(reference, serverIds) ?? undefined;

    switch (definitionType) {
      case 'persona': {
        result = await client.GET('/personas', {
          params: { query: { name, libraryId } },
        });
        break;
      }
      case 'tool': {
        result = await client.GET('/tools', {
          params: { query: { name, libraryId } },
        });
        break;
      }
      case 'task': {
        result = await client.GET('/tasks', {
          params: { query: { name, libraryId, projectId } },
        });
        break;
      }
      case 'workflow': {
        // Fetch workflow-defs with query params
        const url = new URL('/workflow-defs', options.apiUrl);
        url.searchParams.set('name', name);
        if (libraryId) url.searchParams.set('libraryId', libraryId);
        if (projectId) url.searchParams.set('projectId', projectId);

        const response = await fetch(url.toString(), {
          headers: options.apiKey ? { 'X-API-Key': options.apiKey } : {},
        });
        if (!response.ok) {
          result = { error: `${response.status} ${response.statusText}` };
        } else {
          result = { data: await response.json() };
        }
        break;
      }
      case 'model': {
        // Model profiles API doesn't support name filtering, so we fetch all and filter
        try {
          const mpData = await client['model-profiles'].list();
          const matching = mpData.modelProfiles?.filter((mp) => mp.name === name) ?? [];
          result = { data: { modelProfiles: matching } };
        } catch (e) {
          result = { error: e };
        }
        break;
      }
      default:
        return null;
    }

    if (result.error) {
      return null;
    }

    // Extract first item from list response
    const data = result.data as { personas?: Array<{ id: string; contentHash: string | null }> } & {
      tools?: Array<{ id: string; contentHash: string | null }>;
    } & { tasks?: Array<{ id: string; contentHash: string | null }> } & {
      workflowDefs?: Array<{ id: string; contentHash: string | null }>;
    } & { modelProfiles?: Array<{ id: string; contentHash: string | null }> };

    const items =
      data.personas ?? data.tools ?? data.tasks ?? data.workflowDefs ?? data.modelProfiles ?? ([] as Array<{ id: string; contentHash: string | null }>);
    if (items.length > 0) {
      return { id: items[0].id, contentHash: items[0].contentHash };
    }

    return null;
  } catch {
    return null;
  }
}

async function createDefinition(
  def: WorkspaceDefinition,
  client: WonderClient,
  serverIds: Map<string, string>,
  _options: DeployOptions,
  _isStandardLibrary: boolean,
): Promise<string> {
  const { reference, definitionType, document } = def;

  const libraryId = getLibraryId(reference, serverIds);
  const projectId = getProjectId(reference, serverIds);

  switch (definitionType) {
    case 'persona': {
      const result = await client.personas.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
        autoversion: true,
      } as Parameters<typeof client.personas.create>[0]);
      return result.personaId;
    }
    case 'tool': {
      // Tools don't support autoversion - create directly
      const result = await client.tools.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
      } as Parameters<typeof client.tools.create>[0]);
      return result.toolId;
    }
    case 'task': {
      const result = await client.tasks.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
        projectId: projectId ?? undefined,
        autoversion: true,
      } as Parameters<typeof client.tasks.create>[0]);
      return result.taskId;
    }
    case 'workflow': {
      const wfClient = client['workflow-defs'];
      const result = await wfClient.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
        projectId: projectId ?? undefined,
        autoversion: true,
      } as Parameters<typeof wfClient.create>[0]);
      return result.workflowDefId;
    }
    case 'model': {
      const result = await client['model-profiles'].create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
      } as Parameters<typeof client['model-profiles']['create']>[0]);
      return result.modelProfileId;
    }
    default:
      throw new Error(`Unsupported definition type: ${definitionType}`);
  }
}

function getName(ref: Reference): string {
  return ref.name;
}

function getLibraryId(ref: Reference, serverIds: Map<string, string>): string | null {
  if (ref.scope === 'standardLibrary') {
    // Standard library - look up from serverIds
    return serverIds.get(`library:${ref.library}`) ?? null;
  }
  if (ref.scope === 'workspaceLibrary') {
    // Workspace library - look up from serverIds
    return serverIds.get(`library:${ref.library}`) ?? null;
  }
  return null;
}

function getProjectId(ref: Reference, serverIds: Map<string, string>): string | null {
  if (ref.scope === 'project') {
    // Look up project ID from serverIds
    return serverIds.get(`project:${ref.project}`) ?? null;
  }
  return null;
}

async function fetchStandardLibraryManifest(
  apiUrl: string,
  apiKey: string,
): Promise<StandardLibraryManifest> {
  const url = new URL('/standard-library/manifest', apiUrl);
  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as StandardLibraryManifest;
}

function reportResults(
  results: DeployResult[],
  options: DeployOptions,
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
        `  Deploy completed with errors: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`,
      ),
    );
  } else if (options.dryRun) {
    console.log(c.yellow(`  Dry run complete: ${results.length} definitions would be deployed`));
  } else {
    console.log(
      c.green(`  Deploy successful: ${created} created, ${updated} updated, ${skipped} skipped`),
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
