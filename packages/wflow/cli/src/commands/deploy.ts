/**
 * wflow deploy command
 *
 * Deploy workspace definitions to the server in topological order.
 * Supports idempotent deployment via content hashing.
 */

import {
  formatReference,
  getDeployOrder,
  parseReference,
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
  // Create definition - server handles deduplication via autoversion
  const result = await createDefinition(def, client, serverIds, options, isStandardLibrary);

  // Determine action based on reused flag and version number
  let action: DeployResult['action'];
  if (result.reused) {
    action = 'skipped';
  } else if (result.version > 1) {
    action = 'updated';
  } else {
    action = 'created';
  }

  return {
    definition: def,
    action,
    serverId: result.id,
  };
}

async function createDefinition(
  def: WorkspaceDefinition,
  client: WonderClient,
  serverIds: Map<string, string>,
  _options: DeployOptions,
  _isStandardLibrary: boolean,
): Promise<{ id: string; reused: boolean; version: number }> {
  const { reference, definitionType, document } = def;

  const libraryId = getLibraryId(reference, serverIds);
  const projectId = getProjectId(reference, serverIds);

  switch (definitionType) {
    case 'persona': {
      const personaDoc = document as Record<string, unknown>;
      const result = await client.personas.create({
        ...personaDoc,
        name: getName(reference),
        libraryId: libraryId ?? undefined,
        // Resolve reference IDs to server IDs
        modelProfileId: resolveReferenceId(personaDoc.modelProfileId as string | undefined, serverIds),
        contextAssemblyWorkflowId: resolveReferenceId(personaDoc.contextAssemblyWorkflowId as string | undefined, serverIds),
        memoryExtractionWorkflowId: resolveReferenceId(personaDoc.memoryExtractionWorkflowId as string | undefined, serverIds),
        autoversion: true,
      } as Parameters<typeof client.personas.create>[0]);
      return { id: result.personaId, reused: result.reused ?? false, version: result.version };
    }
    case 'tool': {
      // Tools don't support autoversion
      const result = await client.tools.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
      } as Parameters<typeof client.tools.create>[0]);
      return { id: result.toolId, reused: false, version: 1 };
    }
    case 'task': {
      const result = await client.tasks.create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        libraryId: libraryId ?? undefined,
        projectId: projectId ?? undefined,
        autoversion: true,
      } as Parameters<typeof client.tasks.create>[0]);
      return { id: result.taskId, reused: result.reused ?? false, version: result.version };
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
      return { id: result.workflowDefId, reused: result.reused ?? false, version: result.version };
    }
    case 'model': {
      const result = await client['model-profiles'].create({
        ...(document as Record<string, unknown>),
        name: getName(reference),
        autoversion: true,
      } as unknown as Parameters<typeof client['model-profiles']['create']>[0]);
      return { id: result.modelProfileId, reused: result.reused ?? false, version: result.version };
    }
    case 'action': {
      const actionDoc = document as Record<string, unknown>;
      const result = await client.actions.create({
        name: getName(reference),
        description: actionDoc.description as string,
        version: (actionDoc.version as number) ?? 1,
        kind: actionDoc.kind as 'llm' | 'mcp' | 'http' | 'human' | 'context' | 'artifact' | 'vector' | 'metric' | 'mock',
        implementation: actionDoc.implementation as Record<string, unknown>,
        requires: actionDoc.requires as Record<string, unknown> | undefined,
        produces: actionDoc.produces as Record<string, unknown> | undefined,
        execution: actionDoc.execution as Record<string, unknown> | undefined,
        idempotency: actionDoc.idempotency as Record<string, unknown> | undefined,
        autoversion: true,
      });
      return { id: result.actionId, reused: result.reused ?? false, version: result.version };
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

/**
 * Resolve a reference string (e.g., "core/claude-sonnet") to its server ID (ULID)
 * Returns the original value if it's not a valid reference or not found in serverIds
 */
function resolveReferenceId(refString: string | undefined, serverIds: Map<string, string>): string | undefined {
  if (!refString) return undefined;

  try {
    const ref = parseReference(refString);
    const formatted = formatReference(ref);
    return serverIds.get(formatted) ?? refString;
  } catch {
    // Not a valid reference format, return as-is (might be a literal ID)
    return refString;
  }
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
