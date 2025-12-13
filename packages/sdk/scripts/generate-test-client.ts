/**
 * Test Client Generator - Generate test-specific client with auto-unwrapping and tracking
 *
 * Generates a test client that:
 * 1. Auto-unwraps API responses (extracts resource from wrapper)
 * 2. Auto-tracks created resources for cleanup
 * 3. Provides LIFO cleanup with error resilience
 */

import { ClientMethod, ClientProperty, ClientStructure } from './generate-client';

/**
 * Get the singular resource name from a collection name
 * Examples:
 *   workspaces -> workspace
 *   model-profiles -> model_profile (API uses underscores in response keys)
 *   workflows -> workflow
 */
function singularize(collectionName: string): string {
  // Handle special cases first - API uses underscores in response keys, not dashes
  const specialCases: Record<string, string> = {
    'model-profiles': 'model_profile',
    'prompt-specs': 'prompt_spec',
    'workflow-defs': 'workflow_def',
    'task-defs': 'task_def',
    'workflow-runs': 'workflow_run',
  };

  if (specialCases[collectionName]) {
    return specialCases[collectionName];
  }

  // Simple pluralization rules for common cases
  if (collectionName.endsWith('ies')) {
    return collectionName.slice(0, -3) + 'y';
  }
  if (
    collectionName.endsWith('ses') ||
    collectionName.endsWith('ches') ||
    collectionName.endsWith('xes')
  ) {
    return collectionName.slice(0, -2);
  }
  if (collectionName.endsWith('s')) {
    return collectionName.slice(0, -1);
  }
  return collectionName;
}

/**
 * Find collections that have create() methods
 */
function findCreatableCollections(structure: ClientStructure): ClientProperty[] {
  const creatableCollections: ClientProperty[] = [];

  function traverse(prop: ClientProperty) {
    const hasCreateMethod = prop.methods?.some((m) => m.name === 'create');
    if (hasCreateMethod && prop.type === 'collection') {
      creatableCollections.push(prop);
    }

    // Traverse children
    if (prop.children) {
      for (const child of prop.children) {
        traverse(child);
      }
    }
  }

  for (const collection of structure.collections) {
    traverse(collection);
  }

  return creatableCollections;
}

/**
 * Generate unwrapping wrapper for a create method
 */
function generateCreateWrapper(
  collection: ClientProperty,
  method: ClientMethod,
  indent: string,
): string {
  const resourceName = singularize(collection.name);
  const collectionPath = collection.name.includes('-')
    ? `["${collection.name}"]`
    : `.${collection.name}`;

  // Build parameter list from method signature
  const params = method.signature.parameters
    .map((p) => `${p.name}${p.optional ? '?' : ''}: any`)
    .join(', ');

  const paramNames = method.signature.parameters.map((p) => p.name).join(', ');

  // Extract resource type from response
  const responseType = `paths['${method.originalPath}']['${method.verb}']['responses']['${method.successStatusCode}']['content']['application/json']`;
  const resourceType = `NonNullable<${responseType}['${resourceName}']>`;

  // Use bracket notation for kebab-case resource names
  const resourceAccess = resourceName.includes('-') ? `["${resourceName}"]` : `.${resourceName}`;

  return `${indent}create: async (${params}): Promise<${resourceType}> => {
${indent}  const response = await standardClient${collectionPath}.create(${paramNames});
${indent}  const resource = response${resourceAccess};
${indent}  
${indent}  if (!resource) {
${indent}    throw new Error('Failed to create ${resourceName}: resource not in response');
${indent}  }
${indent}  
${indent}  // Track for cleanup
${indent}  tracker.track({
${indent}    delete: () => standardClient${collectionPath}(resource.id).delete()
${indent}  });
${indent}  
${indent}  return resource;
${indent}}`;
}

/**
 * Generate test client collections with unwrapping wrappers
 */
function generateTestClientCollections(structure: ClientStructure, indent: string): string[] {
  const creatableCollections = findCreatableCollections(structure);
  const lines: string[] = [];

  for (const collection of creatableCollections) {
    const createMethod = collection.methods?.find((m) => m.name === 'create');
    if (!createMethod) continue;

    const propertyName = collection.name.includes('-') ? `"${collection.name}"` : collection.name;

    lines.push(`${indent}${propertyName}: {`);
    lines.push(generateCreateWrapper(collection, createMethod, indent + '  '));
    lines.push(`${indent}},`);
  }

  return lines;
}

/**
 * Generate the scaffold method code
 */
function generateScaffoldMethod(indent: string): string {
  return `${indent}/**
${indent} * Scaffold a test project with infrastructure and execute a workflow
${indent} * 
${indent} * Creates workspace, project, and model profile, then creates and executes
${indent} * the provided workflow definition. All resources are tracked for cleanup.
${indent} * 
${indent} * @param options.workflowDef - Function that receives modelProfileId and returns workflow definition
${indent} * @param options.input - Input data to pass to the workflow execution
${indent} * @returns Workflow output and infrastructure resources
${indent} */
${indent}scaffold: async (options: {
${indent}  workflowDef: (modelProfileId: string) => any;
${indent}  input: any;
${indent}}): Promise<{
${indent}  output: any;
${indent}  runId: string;
${indent}  workspace: any;
${indent}  project: any;
${indent}  modelProfile: any;
${indent}}> => {
${indent}  // Create workspace
${indent}  const workspaceResponse = await standardClient.workspaces.create({
${indent}    name: \`Test Workspace \${Date.now()}\`,
${indent}    settings: {}
${indent}  });
${indent}  const workspace = workspaceResponse.workspace;
${indent}  if (!workspace) throw new Error('Failed to create workspace');
${indent}  tracker.track({ delete: () => standardClient.workspaces(workspace.id).delete() });
${indent}  
${indent}  // Create project
${indent}  const projectResponse = await standardClient.projects.create({
${indent}    workspace_id: workspace.id,
${indent}    name: \`Test Project \${Date.now()}\`,
${indent}    settings: {}
${indent}  });
${indent}  const project = projectResponse.project;
${indent}  if (!project) throw new Error('Failed to create project');
${indent}  tracker.track({ delete: () => standardClient.projects(project.id).delete() });
${indent}  
${indent}  // Create model profile
${indent}  const modelProfileResponse = await standardClient["model-profiles"].create({
${indent}    name: \`Test Model \${Date.now()}\`,
${indent}    provider: 'cloudflare',
${indent}    model_id: '@cf/meta/llama-3.1-8b-instruct',
${indent}    parameters: { max_tokens: 512, temperature: 1.0 },
${indent}    cost_per_1k_input_tokens: 0.0,
${indent}    cost_per_1k_output_tokens: 0.0
${indent}  });
${indent}  const modelProfile = modelProfileResponse.model_profile;
${indent}  if (!modelProfile) throw new Error('Failed to create model profile');
${indent}  tracker.track({ delete: () => standardClient["model-profiles"](modelProfile.id).delete() });
${indent}  
${indent}  // Build workflow definition with model profile ID
${indent}  const workflowDef = options.workflowDef(modelProfile.id);
${indent}  
${indent}  // Inject project ID into workflow definition
${indent}  const workflowDefWithProject = {
${indent}    ...workflowDef,
${indent}    project_id: project.id
${indent}  };
${indent}  
${indent}  // Create workflow definition
${indent}  const workflowDefResponse = await standardClient["workflow-defs"].create(workflowDefWithProject);
${indent}  const createdWorkflowDef = workflowDefResponse.workflow_def;
${indent}  if (!createdWorkflowDef) throw new Error('Failed to create workflow definition');
${indent}  tracker.track({ delete: () => standardClient["workflow-defs"](createdWorkflowDef.id).delete() });
${indent}  
${indent}  // Create and execute workflow
${indent}  const workflowResponse = await standardClient.workflows.create({
${indent}    workflow_def_id: createdWorkflowDef.id,
${indent}    input: options.input
${indent}  });
${indent}  const workflow = workflowResponse.workflow;
${indent}  if (!workflow) throw new Error('Failed to create workflow');
${indent}  tracker.track({ delete: () => standardClient.workflows(workflow.id).delete() });
${indent}  
${indent}  // Poll for completion (simple polling implementation)
${indent}  let status = 'running';
${indent}  let output: any;
${indent}  let attempts = 0;
${indent}  const maxAttempts = 60; // 60 seconds max
${indent}  
${indent}  while (status === 'running' && attempts < maxAttempts) {
${indent}    await new Promise(resolve => setTimeout(resolve, 1000));
${indent}    const statusResponse = await standardClient.workflows(workflow.id).get();
${indent}    status = statusResponse.status;
${indent}    output = statusResponse.output;
${indent}    attempts++;
${indent}  }
${indent}  
${indent}  if (status !== 'completed') {
${indent}    throw new Error(\`Workflow did not complete. Status: \${status}\`);
${indent}  }
${indent}  
${indent}  return {
${indent}    output,
${indent}    runId: workflow.id,
${indent}    workspace,
${indent}    project,
${indent}    modelProfile
${indent}  };
${indent}}`;
}

/**
 * Generate the ResourceTracker class code
 */
function generateResourceTrackerClass(): string {
  return `
/**
 * Deletable resource interface
 */
interface Deletable {
  delete: () => Promise<unknown>;
}

/**
 * Tracks created resources for automatic cleanup
 * 
 * Resources are deleted in LIFO order (reverse of creation) to respect
 * referential integrity constraints.
 */
class ResourceTracker {
  private resources: Deletable[] = [];

  /**
   * Add a resource to the cleanup list
   */
  track(resource: Deletable): void {
    this.resources.push(resource);
  }

  /**
   * Get the number of tracked resources
   */
  get count(): number {
    return this.resources.length;
  }

  /**
   * Delete all tracked resources in reverse order (LIFO)
   * 
   * Continues cleanup even if individual deletions fail.
   * Clears the tracking list after cleanup.
   */
  async cleanup(): Promise<void> {
    if (this.resources.length === 0) {
      return;
    }

    console.log(\`✨ Cleaning up \${this.resources.length} resources...\`);

    // Delete in reverse order (LIFO)
    const reversed = [...this.resources].reverse();

    for (const resource of reversed) {
      try {
        await resource.delete();
      } catch (error) {
        // Continue cleanup despite errors (resource may already be deleted)
        console.warn('Failed to delete resource:', error);
      }
    }

    this.resources = [];
    console.log('🧹 Cleanup complete!');
  }
}`.trim();
}

/**
 * Generate the complete test client code
 */
export function formatTestClientCode(structure: ClientStructure): string {
  const lines: string[] = [];

  // JSDoc header
  lines.push('/**');
  lines.push(' * Generated test client for Wonder API');
  lines.push(' * This file was auto-generated. Do not edit manually.');
  lines.push(' *');
  lines.push(' * Provides:');
  lines.push(' * - Auto-unwrapping of API responses');
  lines.push(' * - Auto-tracking of created resources');
  lines.push(' * - LIFO cleanup with error resilience');
  lines.push(' */');
  lines.push('');

  // Imports
  lines.push("import type { paths } from './schema.js';");
  lines.push("import { createClient } from './client.js';");
  lines.push('');

  // ResourceTracker class
  lines.push(generateResourceTrackerClass());
  lines.push('');
  lines.push('');

  // Test client factory function
  lines.push('/**');
  lines.push(' * Create a test client for Wonder API');
  lines.push(' *');
  lines.push(' * The test client automatically unwraps responses and tracks created resources');
  lines.push(' * for cleanup. Use this in integration tests instead of the standard client.');
  lines.push(' *');
  lines.push(' * @param baseClient - The underlying HTTP client (from openapi-fetch)');
  lines.push(' */');
  lines.push('export function createTestClient(baseClient: any) {');
  lines.push('  const standardClient = createClient(baseClient);');
  lines.push('  const tracker = new ResourceTracker();');
  lines.push('');
  lines.push('  const client = {');
  lines.push('    tracker,');
  lines.push('');

  // Generate collection wrappers
  const collectionLines = generateTestClientCollections(structure, '    ');
  lines.push(...collectionLines);

  lines.push('');

  // Generate scaffold method
  lines.push(generateScaffoldMethod('    '));

  lines.push('  };');
  lines.push('');

  // Add camelCase aliases for kebab-case properties
  lines.push('  // Add camelCase aliases for kebab-case properties');
  lines.push('  return Object.assign(client, {');

  const aliasLines: string[] = [];
  const creatableCollections = findCreatableCollections(structure);
  for (const collection of creatableCollections) {
    if (collection.name.includes('-')) {
      const camelCase = collection.name.replace(/-([a-z])/g, (_, letter: string) =>
        letter.toUpperCase(),
      );
      aliasLines.push(`    ${camelCase}: client["${collection.name}"]`);
    }
  }

  if (aliasLines.length > 0) {
    lines.push(aliasLines.join(',\n'));
  }

  lines.push('  });');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
