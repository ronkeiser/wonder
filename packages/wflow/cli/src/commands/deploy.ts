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
import { loadConfig } from '../config';
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
  /** The version that was deployed or matched */
  version?: number;
  message?: string;
  /** Version that was matched when skipping */
  matchedVersion?: number;
  /** Latest version for this name when skipping */
  latestVersion?: number;
}

export const deployCommand = new Command('deploy')
  .description('Deploy workspace definitions to the server')
  .argument('[path]', 'Workspace directory to deploy', '.')
  .option('--dry-run', 'Show what would be deployed without making changes')
  .option('--force', 'Deploy all definitions, even if unchanged')
  .option('--workspace-id <id>', 'Target workspace ID on the server')
  .option('--api-url <url>', 'API URL')
  .option('--api-key <key>', 'API key for authentication')
  .option('--quiet', 'Minimal output')
  .option('--no-color', 'Disable colored output')
  .action(async (targetPath: string, options: DeployOptions) => {
    try {
      // Load config from .env files (searched from cwd upward)
      const config = loadConfig();

      // Apply config as defaults (CLI flags take precedence)
      const resolvedOptions: DeployOptions = {
        ...options,
        apiUrl: options.apiUrl ?? config.apiUrl ?? 'https://api.wflow.app',
        apiKey: options.apiKey ?? config.apiKey,
      };

      await runDeploy(targetPath, resolvedOptions);
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

  // Track server IDs and versions for references (includes library IDs)
  const serverIds = new Map<string, { id: string; version: number }>();

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
        serverIds.set(`library:${libraryName}`, { id: libraryId, version: 1 });
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
        serverIds.set(refStr, { id: result.serverId, version: result.version ?? 1 });
      }

      if (!options.quiet) {
        const icon =
          result.action === 'created'
            ? c.green('✓')
            : result.action === 'updated'
              ? c.yellow('↺')
              : c.gray('○');

        // Check if skipping with an old version (not the latest)
        const isOldVersion = result.action === 'skipped' &&
          result.matchedVersion !== undefined &&
          result.latestVersion !== undefined &&
          result.matchedVersion < result.latestVersion;

        if (isOldVersion) {
          console.log(`  ${c.yellow('⚠')} ${refStr} (${def.definitionType}) - skipped (matches v${result.matchedVersion}, latest is v${result.latestVersion})`);
        } else {
          console.log(`  ${icon} ${refStr} (${def.definitionType}) - ${result.action}`);
        }
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
  serverIds: Map<string, { id: string; version: number }>,
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
    version: result.version,
    matchedVersion: result.reused ? result.version : undefined,
    latestVersion: result.latestVersion,
  };
}

async function createDefinition(
  def: WorkspaceDefinition,
  client: WonderClient,
  serverIds: Map<string, { id: string; version: number }>,
  options: DeployOptions,
  _isStandardLibrary: boolean,
): Promise<{ id: string; reused: boolean; version: number; latestVersion?: number }> {
  const { reference, definitionType, document } = def;

  const libraryId = getLibraryId(reference, serverIds);
  const projectId = getProjectId(reference, serverIds);

  const doc = document as Record<string, unknown>;
  const refString = getReference(reference);
  const displayName = getDisplayName(doc, reference);

  switch (definitionType) {
    case 'persona': {
      const result = await client.personas.create({
        ...doc,
        name: displayName,
        reference: refString,
        libraryId: libraryId ?? undefined,
        // Pass refs directly - server expects refs, not resolved IDs
        modelProfileRef: doc.modelProfileRef as string,
        contextAssemblyWorkflowRef: doc.contextAssemblyWorkflowRef as string,
        memoryExtractionWorkflowRef: doc.memoryExtractionWorkflowRef as string,
        autoversion: true,
        force: options.force,
      } as unknown as Parameters<typeof client.personas.create>[0]);
      const latestVersion = (result as { latestVersion?: number }).latestVersion;
      return { id: result.personaId, reused: result.reused ?? false, version: result.version, latestVersion };
    }
    case 'tool': {
      // Tools don't support autoversion
      const result = await client.tools.create({
        ...doc,
        name: displayName,
        libraryId: libraryId ?? undefined,
      } as Parameters<typeof client.tools.create>[0]);
      return { id: result.toolId, reused: false, version: 1 };
    }
    case 'task': {
      // Resolve step references (import aliases -> server IDs)
      const imports = doc.imports as Record<string, string> | undefined;
      const resolvedSteps = resolveStepReferences(
        doc.steps as Array<Record<string, unknown>> | undefined,
        imports,
        def.filePath,
        serverIds,
      );
      const result = await client.tasks.create({
        ...doc,
        steps: resolvedSteps,
        name: displayName,
        reference: refString,
        libraryId: libraryId ?? undefined,
        projectId: projectId ?? undefined,
        autoversion: true,
        force: options.force,
      } as unknown as Parameters<typeof client.tasks.create>[0]);
      const latestVersion = (result as { latestVersion?: number }).latestVersion;
      return { id: result.taskId, reused: result.reused ?? false, version: result.version, latestVersion };
    }
    case 'workflow': {
      const wfClient = client['workflow-defs'];
      // Resolve taskId references in nodes (import aliases -> server IDs)
      const imports = doc.imports as Record<string, string> | undefined;
      const resolvedNodes = resolveNodeReferences(
        doc.nodes as Record<string, unknown> | undefined,
        imports,
        def.filePath,
        serverIds,
      );
      const result = await wfClient.create({
        ...doc,
        nodes: resolvedNodes,
        name: displayName,
        reference: refString,
        libraryId: libraryId ?? undefined,
        projectId: projectId ?? undefined,
        autoversion: true,
        force: options.force,
      } as unknown as Parameters<typeof wfClient.create>[0]);
      const latestVersion = (result as { latestVersion?: number }).latestVersion;
      return { id: result.workflowDefId, reused: result.reused ?? false, version: result.version, latestVersion };
    }
    case 'model': {
      const result = await client['model-profiles'].create({
        ...doc,
        name: displayName,
        reference: refString,
        autoversion: true,
        force: options.force,
      } as unknown as Parameters<typeof client['model-profiles']['create']>[0]);
      const latestVersion = (result as { latestVersion?: number }).latestVersion;
      return { id: result.modelProfileId, reused: result.reused ?? false, version: result.version, latestVersion };
    }
    case 'action': {
      const result = await client.actions.create({
        name: displayName,
        reference: refString,
        description: doc.description as string,
        version: (doc.version as number) ?? 1,
        kind: doc.kind as 'llm' | 'mcp' | 'http' | 'human' | 'context' | 'artifact' | 'vector' | 'metric' | 'mock',
        implementation: doc.implementation as Record<string, unknown>,
        requires: doc.requires as Record<string, unknown> | undefined,
        produces: doc.produces as Record<string, unknown> | undefined,
        execution: doc.execution as Record<string, unknown> | undefined,
        idempotency: doc.idempotency as Record<string, unknown> | undefined,
        autoversion: true,
        force: options.force,
      } as unknown as Parameters<typeof client.actions.create>[0]);
      const latestVersion = (result as { latestVersion?: number }).latestVersion;
      return { id: result.actionId, reused: result.reused ?? false, version: result.version, latestVersion };
    }
    default:
      throw new Error(`Unsupported definition type: ${definitionType}`);
  }
}

/**
 * Get the reference string from a file-path-derived Reference
 */
function getReference(ref: Reference): string {
  return formatReference(ref);
}

/**
 * Get the user-facing name from the document.
 * Falls back to the reference name if the document doesn't have a name field.
 */
function getDisplayName(doc: Record<string, unknown>, ref: Reference): string {
  // Document type identifier fields that contain the name
  const nameFields = ['persona', 'workflow', 'task', 'action', 'model', 'tool', 'name'];
  for (const field of nameFields) {
    if (typeof doc[field] === 'string' && doc[field]) {
      return doc[field] as string;
    }
  }
  // Fallback to reference name
  return ref.name;
}

function getLibraryId(ref: Reference, serverIds: Map<string, { id: string; version: number }>): string | null {
  if (ref.scope === 'standardLibrary') {
    // Standard library - look up from serverIds
    return serverIds.get(`library:${ref.library}`)?.id ?? null;
  }
  if (ref.scope === 'workspaceLibrary') {
    // Workspace library - look up from serverIds
    return serverIds.get(`library:${ref.library}`)?.id ?? null;
  }
  return null;
}

function getProjectId(ref: Reference, serverIds: Map<string, { id: string; version: number }>): string | null {
  if (ref.scope === 'project') {
    // Look up project ID from serverIds
    return serverIds.get(`project:${ref.project}`)?.id ?? null;
  }
  return null;
}

/**
 * Resolve a reference string (e.g., "core/claude-sonnet") to its server ID (ULID)
 * Returns the original value if it's not a valid reference or not found in serverIds
 */
function resolveReferenceId(refString: string | undefined, serverIds: Map<string, { id: string; version: number }>): string | undefined {
  if (!refString) return undefined;

  try {
    const ref = parseReference(refString);
    const formatted = formatReference(ref);
    return serverIds.get(formatted)?.id ?? refString;
  } catch {
    // Not a valid reference format, return as-is (might be a literal ID)
    return refString;
  }
}

/**
 * Resolve step references in a task document.
 * Converts import aliases to server IDs and adds required fields (ordinal, actionVersion).
 */
function resolveStepReferences(
  steps: Array<Record<string, unknown>> | undefined,
  imports: Record<string, string> | undefined,
  taskFilePath: string,
  serverIds: Map<string, { id: string; version: number }>,
): unknown[] | undefined {
  if (!steps) return undefined;

  const resolved: unknown[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const actionIdAlias = (step.action_id ?? step.actionId) as string | undefined;
    const actionVersion = (step.action_version ?? step.actionVersion) as number | undefined;
    const resolvedAction = actionIdAlias
      ? resolveImportAlias(actionIdAlias, imports, taskFilePath, serverIds)
      : undefined;

    resolved.push({
      ref: step.ref,
      ordinal: i,
      actionId: resolvedAction?.id,
      actionVersion: actionVersion ?? resolvedAction?.version,
      inputMapping: step.input_mapping ?? step.inputMapping ?? null,
      outputMapping: step.output_mapping ?? step.outputMapping ?? null,
      onFailure: step.on_failure ?? step.onFailure ?? 'abort',
      condition: step.condition ?? null,
    });
  }
  return resolved;
}

/**
 * Resolve taskId and subworkflowId references in workflow nodes.
 * Import aliases (e.g., "passthrough_task") get resolved to server IDs (ULIDs).
 *
 * Handles both:
 * - Object format: { build_request: { taskId: '...' } } (raw YAML before parsing)
 * - Array format: [{ ref: 'build_request', taskId: '...' }] (after parseWorkflow)
 *
 * Outputs array format for API with camelCase field names.
 *
 * @param nodes - The nodes from the workflow document (array or object)
 * @param imports - The imports object mapping aliases to relative paths
 * @param workflowFilePath - Absolute path to the workflow file (for resolving relative imports)
 * @param serverIds - Map of reference strings to server IDs and versions
 * @returns Array of nodes with resolved references (API format)
 */
function resolveNodeReferences(
  nodes: unknown[] | Record<string, unknown> | undefined,
  imports: Record<string, string> | undefined,
  workflowFilePath: string,
  serverIds: Map<string, { id: string; version: number }>,
): unknown[] | undefined {
  if (!nodes) return undefined;

  // Convert object format to array format if needed
  const nodesArray: Array<Record<string, unknown>> = Array.isArray(nodes)
    ? nodes as Array<Record<string, unknown>>
    : Object.entries(nodes).map(([ref, nodeDef]) => ({
        ref,
        ...(typeof nodeDef === 'object' && nodeDef !== null ? nodeDef : {}),
      }));

  const resolved: unknown[] = [];
  for (const node of nodesArray) {
    if (typeof node !== 'object' || node === null) {
      continue;
    }

    // Handle both snake_case (from YAML) and camelCase (after parsing)
    const taskIdAlias = (node.task_id ?? node.taskId) as string | undefined;
    const taskVersion = (node.task_version ?? node.taskVersion) as number | undefined;
    const subworkflowIdAlias = (node.subworkflow_id ?? node.subworkflowId) as string | undefined;
    const subworkflowVersion = (node.subworkflow_version ?? node.subworkflowVersion) as number | undefined;
    const inputMapping = node.input_mapping ?? node.inputMapping;
    const outputMapping = node.output_mapping ?? node.outputMapping;
    const resourceBindings = node.resource_bindings ?? node.resourceBindings;

    // Resolve references to get both ID and version
    const resolvedTask = taskIdAlias
      ? resolveImportAlias(taskIdAlias, imports, workflowFilePath, serverIds)
      : undefined;
    const resolvedSubworkflow = subworkflowIdAlias
      ? resolveImportAlias(subworkflowIdAlias, imports, workflowFilePath, serverIds)
      : undefined;

    resolved.push({
      ref: node.ref,
      name: node.name,
      taskId: resolvedTask?.id,
      taskVersion: taskVersion ?? resolvedTask?.version,
      subworkflowId: resolvedSubworkflow?.id,
      subworkflowVersion: subworkflowVersion ?? resolvedSubworkflow?.version,
      inputMapping: inputMapping ?? undefined,
      outputMapping: outputMapping ?? undefined,
      resourceBindings: resourceBindings ?? undefined,
    });
  }
  return resolved;
}

/**
 * Resolve an import alias to a server ID and version.
 *
 * Flow: import alias -> relative path -> full reference -> { id, version }
 *
 * @param alias - The import alias (e.g., "passthrough_task")
 * @param imports - The imports object mapping aliases to relative paths
 * @param filePath - Absolute path to the file containing the import
 * @param serverIds - Map of reference strings to server IDs and versions
 * @returns The resolved { id, version } or undefined if not found
 */
function resolveImportAlias(
  alias: string,
  imports: Record<string, string> | undefined,
  filePath: string,
  serverIds: Map<string, { id: string; version: number }>,
): { id: string; version: number } | undefined {
  // First, try direct reference resolution (for explicit references like "core/task-name")
  try {
    const ref = parseReference(alias);
    const formatted = formatReference(ref);
    const entry = serverIds.get(formatted);
    if (entry) {
      return entry;
    }
  } catch {
    // Not a valid reference format, continue to import resolution
  }

  // If not a direct reference, try resolving via imports
  // Note: imports keys may be camelCase (after parsing) but alias may be snake_case (from YAML value)
  // Try both the original alias and camelCase version
  const camelAlias = alias.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
  const relativePath = imports?.[alias] ?? imports?.[camelAlias];

  if (!relativePath) {
    return undefined; // No import found
  }

  // Resolve the relative path to an absolute path, then derive the reference
  const fileDir = path.dirname(filePath);
  const importedFilePath = path.resolve(fileDir, relativePath);

  // Find the server entry by matching against all known references
  // The reference is derived from the file path structure
  for (const [refString, entry] of serverIds.entries()) {
    // Check if the file path matches this reference
    // Reference format: "library/name" -> file would be in "libraries/library/name.ext"
    const pathPattern = refString.replace('/', path.sep);
    if (importedFilePath.includes(pathPattern)) {
      return entry;
    }
  }

  // Try to derive the reference from the imported file path
  // Path like: .../libraries/core/context-assembly-passthrough.task
  // Reference: core/context-assembly-passthrough
  const pathParts = importedFilePath.split(path.sep);
  const librariesIndex = pathParts.indexOf('libraries');
  if (librariesIndex !== -1 && librariesIndex < pathParts.length - 2) {
    const libraryName = pathParts[librariesIndex + 1];
    const fileName = pathParts[pathParts.length - 1];
    const baseName = fileName.replace(/\.[^.]+$/, ''); // Remove extension
    const derivedRef = `${libraryName}/${baseName}`;

    const entry = serverIds.get(derivedRef);
    if (entry) {
      return entry;
    }
  }

  return undefined; // Resolution failed
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
