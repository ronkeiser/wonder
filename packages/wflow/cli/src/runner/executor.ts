/**
 * Test runner - executes tests against the Wonder API
 *
 * Mirrors the pattern from packages/e2e/src/kit.ts:
 * 1. Parse .test file → extract workflow/task/action definitions
 * 2. Transform to SDK builder structures
 * 3. Call Wonder API: setupTestContext → createWorkflow → executeWorkflow → cleanup
 * 4. Evaluate assertions against actual execution result
 */

import {
  action,
  createClient,
  node,
  promptSpec,
  schema,
  step,
  task,
  workflow,
  type EmbeddedAction,
  type EmbeddedNode,
  type EmbeddedPromptSpec,
  type EmbeddedStep,
  type EmbeddedTaskDef,
  type EmbeddedWorkflowDef,
  type WonderClient,
} from '@wonder/sdk';
import {
  parseAction,
  parseTask,
  parseTest,
  parseWorkflow,
  type ActionDocument,
  type ImportsMap,
  type JSONSchemaProperty,
  type TaskDocument,
  type TestCaseDecl,
  type TestDocument,
  type WflowDocument,
} from '@wonder/wflow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { evaluateAssertions, type AssertionResult } from './assertions.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single test case execution
 */
export interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration_ms: number;
  assertions?: AssertionResult[];
  error?: Error;
  output?: unknown;
  workflowRunId?: string;
}

/**
 * Result of a test suite execution
 */
export interface TestSuiteResult {
  suite: string;
  file: string;
  tests: TestCaseResult[];
  duration_ms: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
}

/**
 * Options for running tests
 */
export interface TestRunOptions {
  filter?: string;
  tags?: string[];
  timeout_ms?: number;
  failFast?: boolean;
  parallel?: boolean;
  maxConcurrent?: number;
  /** Log events to console as they arrive */
  logEvents?: boolean;
  /** Base URL for Wonder API */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
}

/**
 * Test context with parsed documents and API client
 */
interface TestContext {
  doc: TestDocument;
  imports: ImportsMap;
  resolvedImports: Map<string, WflowDocument | TaskDocument | ActionDocument>;
  basePath: string;
  client: WonderClient;
}

/**
 * API test context (workspace, project, model profile)
 */
interface ApiTestContext {
  workspaceId: string;
  projectId: string;
  modelProfileId: string;
}

/**
 * Created resources for cleanup
 */
interface CreatedResources {
  promptSpecIds: string[];
  actionIds: string[];
  taskIds: string[];
  workflowDefId?: string;
  workflowId?: string;
  workflowRunId?: string;
}

// =============================================================================
// API Setup/Teardown (mirrors kit.ts)
// =============================================================================

/**
 * Set up base infrastructure for test execution
 */
async function setupApiTestContext(client: WonderClient): Promise<ApiTestContext> {
  // Create workspace
  const workspaceResponse = await client.workspaces.create({
    name: `wflow-test-${Date.now()}`,
  });
  const workspaceId = workspaceResponse.workspace.id;

  // Create project
  const projectResponse = await client.projects.create({
    workspace_id: workspaceId,
    name: `wflow-test-project-${Date.now()}`,
    description: 'Auto-created by wflow test CLI',
  });
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await client.modelProfiles.create({
    name: `wflow-test-model-${Date.now()}`,
    provider: 'cloudflare',
    model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    parameters: {
      max_tokens: 512,
      temperature: 1.0,
    },
    cost_per_1k_input_tokens: 0.0,
    cost_per_1k_output_tokens: 0.0,
  });
  const modelProfileId = modelProfileResponse.model_profile.id;

  return { workspaceId, projectId, modelProfileId };
}

/**
 * Clean up all created resources
 */
async function cleanupResources(
  client: WonderClient,
  apiCtx: ApiTestContext,
  resources: CreatedResources,
): Promise<void> {
  // Delete in reverse dependency order
  if (resources.workflowRunId) {
    try {
      await client['workflow-runs'](resources.workflowRunId).delete();
    } catch {
      /* ignore */
    }
  }

  if (resources.workflowId) {
    try {
      await client.workflows(resources.workflowId).delete();
    } catch {
      /* ignore */
    }
  }

  if (resources.workflowDefId) {
    try {
      await client['workflow-defs'](resources.workflowDefId).delete();
    } catch {
      /* ignore */
    }
  }

  for (const id of resources.taskIds.reverse()) {
    try {
      await client.tasks(id).delete();
    } catch {
      /* ignore */
    }
  }

  for (const id of resources.actionIds.reverse()) {
    try {
      await client.actions(id).delete();
    } catch {
      /* ignore */
    }
  }

  for (const id of resources.promptSpecIds.reverse()) {
    try {
      await client['prompt-specs'](id).delete();
    } catch {
      /* ignore */
    }
  }

  try {
    await client['model-profiles'](apiCtx.modelProfileId).delete();
  } catch {
    /* ignore */
  }

  try {
    await client.projects(apiCtx.projectId).delete();
  } catch {
    /* ignore */
  }

  try {
    await client.workspaces(apiCtx.workspaceId).delete();
  } catch {
    /* ignore */
  }
}

// =============================================================================
// Transform .wflow AST → SDK Builders
// =============================================================================

/**
 * Transform JSONSchemaProperty to SDK schema format
 */
function transformSchema(schemaDoc: JSONSchemaProperty | undefined): unknown {
  if (!schemaDoc) return schema.object({});

  // Pass through as-is - SDK accepts JSONSchema
  return schemaDoc;
}

/**
 * Transform ActionDocument to EmbeddedAction
 */
function transformAction(actionDoc: ActionDocument, _testContext: TestContext): EmbeddedAction {
  let impl: Record<string, unknown> = { ...actionDoc.implementation };
  let kind = actionDoc.kind || 'llm_call';

  // Handle execution-based action definition (DSL format)
  // Transform execution.type: "prompt" into implementation with prompt_spec
  const execution = actionDoc.execution as Record<string, unknown> | undefined;
  if (execution?.type === 'prompt') {
    // Build template from system + user prompts
    let template = '';
    if (execution.system) {
      template += `<system>${execution.system}</system>\n`;
    }
    if (execution.user) {
      template += String(execution.user);
    }

    // Create embedded prompt spec
    // Note: Parser may produce input_schema/output_schema instead of requires/produces
    const inputSchema = (actionDoc as any).input_schema || actionDoc.requires;
    const outputSchema = (actionDoc as any).output_schema || actionDoc.produces;

    const embeddedPrompt = promptSpec({
      name: `${actionDoc.action || 'action'}-prompt`,
      description: actionDoc.description || 'Auto-generated prompt spec',
      template,
      requires: transformSchema(inputSchema) as Record<string, unknown>,
      produces: transformSchema(outputSchema) as any,
    });

    impl = { prompt_spec: embeddedPrompt };
    kind = 'llm_call';
  } else if (kind === 'llm' && impl.template && typeof impl.template === 'string') {
    // Legacy format: kind: 'llm' with impl.template
    const embeddedPrompt = promptSpec({
      name: `${actionDoc.action || 'action'}-prompt`,
      description: actionDoc.description || 'Auto-generated prompt spec',
      template: impl.template as string,
      requires: (actionDoc.requires || {}) as Record<string, unknown>,
      produces: transformSchema(actionDoc.produces) as any,
    });
    impl = { prompt_spec: embeddedPrompt };
    kind = 'llm_call';
  }

  return action({
    name: actionDoc.action || actionDoc.name || 'unnamed-action',
    description: actionDoc.description || '',
    version: actionDoc.version || 1,
    kind: kind as any,
    implementation: impl,
    requires: transformSchema(actionDoc.requires) as any,
    produces: transformSchema(actionDoc.produces) as any,
    execution: undefined, // Execution is now in implementation
    idempotency: actionDoc.idempotency as Record<string, unknown> | undefined,
  });
}

/**
 * Transform TaskDocument to EmbeddedTaskDef
 */
function transformTask(taskDoc: TaskDocument, testContext: TestContext): EmbeddedTaskDef {
  const embeddedSteps: EmbeddedStep[] = [];

  if (taskDoc.steps) {
    for (const stepDoc of taskDoc.steps) {
      let embeddedAction: EmbeddedAction | undefined;

      // Resolve action reference
      if (stepDoc.action_id) {
        const actionDoc = testContext.resolvedImports.get(stepDoc.action_id);
        if (actionDoc && 'action' in actionDoc) {
          embeddedAction = transformAction(actionDoc as ActionDocument, testContext);
        }
      }

      embeddedSteps.push(
        step({
          ref: stepDoc.ref || `step-${stepDoc.ordinal || 0}`,
          ordinal: stepDoc.ordinal || 0,
          action: embeddedAction,
          // Support both input_mapping and input_map (parser may produce either)
          input_mapping: stepDoc.input_mapping || (stepDoc as any).input_map || undefined,
          output_mapping: stepDoc.output_mapping || (stepDoc as any).output_map || undefined,
          on_failure: stepDoc.on_failure,
          condition: stepDoc.condition,
        }),
      );
    }
  }

  return task({
    name: taskDoc.task || taskDoc.name || 'unnamed-task',
    description: taskDoc.description || '',
    version: taskDoc.version || 1,
    input_schema: transformSchema(taskDoc.input_schema) as any,
    output_schema: transformSchema(taskDoc.output_schema) as any,
    steps: embeddedSteps,
    retry: taskDoc.retry,
    timeout_ms: taskDoc.timeout_ms,
  });
}

/**
 * Transform WflowDocument to EmbeddedWorkflowDef
 */
function transformWorkflow(wflowDoc: WflowDocument, testContext: TestContext): EmbeddedWorkflowDef {
  const embeddedNodes: EmbeddedNode[] = [];

  if (wflowDoc.nodes) {
    for (const [nodeRef, nodeDoc] of Object.entries(wflowDoc.nodes)) {
      // Resolve task reference
      if (!nodeDoc.task_id) {
        throw new Error(`Node '${nodeRef}' must have a task_id`);
      }

      const taskDoc = testContext.resolvedImports.get(nodeDoc.task_id);
      if (!taskDoc || !('task' in taskDoc)) {
        throw new Error(
          `Task '${nodeDoc.task_id}' not found for node '${nodeRef}'. Available imports: ${[...testContext.resolvedImports.keys()].join(', ')}`,
        );
      }

      const embeddedTask = transformTask(taskDoc as TaskDocument, testContext);

      embeddedNodes.push(
        node({
          ref: nodeDoc.ref || nodeRef,
          name: nodeDoc.name || nodeRef,
          task: embeddedTask,
          task_version: nodeDoc.task_version || 1,
          input_mapping: nodeDoc.input_mapping as Record<string, unknown> | undefined,
          output_mapping: nodeDoc.output_mapping as Record<string, unknown> | undefined,
          resource_bindings: nodeDoc.resource_bindings as Record<string, unknown> | undefined,
        }),
      );
    }
  }

  // Transform transitions
  const transitions = wflowDoc.transitions
    ? Object.values(wflowDoc.transitions).map((t) => ({
        from_node_ref: t.from_node_ref || '',
        to_node_ref: t.to_node_ref || '',
        priority: t.priority || 1,
        condition: t.condition as Record<string, unknown> | undefined,
      }))
    : [];

  return workflow({
    name: wflowDoc.workflow || 'unnamed-workflow',
    description: wflowDoc.description || '',
    input_schema: transformSchema(wflowDoc.input_schema) as any,
    output_schema: transformSchema(wflowDoc.output_schema) as any,
    context_schema: transformSchema(wflowDoc.context_schema) as any,
    // Note: output_mapping exists in parsed docs but not in type definition
    output_mapping: (wflowDoc as any).output_mapping as Record<string, string> | undefined,
    initial_node_ref: wflowDoc.initial_node_ref || '',
    nodes: embeddedNodes,
    transitions,
  });
}

// =============================================================================
// File Loading
// =============================================================================

/**
 * Recursively resolve imports from a document
 */
function resolveDocumentImports(
  doc: WflowDocument | TaskDocument | ActionDocument,
  docPath: string,
  resolvedImports: Map<string, WflowDocument | TaskDocument | ActionDocument>,
): void {
  const docBasePath = path.dirname(docPath);

  // Get imports from the document
  let imports: Record<string, string> | undefined;
  if ('imports' in doc && doc.imports) {
    imports = doc.imports as Record<string, string>;
  }

  if (!imports) return;

  for (const [alias, importPath] of Object.entries(imports)) {
    // Skip if already resolved
    if (resolvedImports.has(alias)) continue;

    // Skip library/project paths for now
    if (importPath.startsWith('@library/') || importPath.startsWith('@project/')) {
      continue;
    }

    const resolved = path.resolve(docBasePath, importPath);
    if (!fs.existsSync(resolved)) {
      console.warn(`Import '${alias}' not found: ${resolved}`);
      continue;
    }

    const importContent = fs.readFileSync(resolved, 'utf-8');
    let parsed: { document: WflowDocument | TaskDocument | ActionDocument | null };

    if (importPath.endsWith('.wflow')) {
      parsed = parseWorkflow(importContent, resolved);
    } else if (importPath.endsWith('.task')) {
      parsed = parseTask(importContent, resolved);
    } else if (importPath.endsWith('.action')) {
      parsed = parseAction(importContent, resolved);
    } else {
      continue;
    }

    if (parsed.document) {
      resolvedImports.set(alias, parsed.document);
      // Recursively resolve this document's imports
      resolveDocumentImports(parsed.document, resolved, resolvedImports);
    }
  }
}

/**
 * Load and parse a test file
 */
export async function loadTestFile(
  filePath: string,
  options: TestRunOptions = {},
): Promise<TestContext> {
  const absolutePath = path.resolve(filePath);
  const basePath = path.dirname(absolutePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');

  const resolveImportPath = (importPath: string): string | null => {
    if (importPath.startsWith('@library/') || importPath.startsWith('@project/')) {
      // TODO: Resolve library/project paths via API
      return null;
    }
    const resolved = path.resolve(basePath, importPath);
    return fs.existsSync(resolved) ? resolved : null;
  };

  const result = parseTest(content, absolutePath, resolveImportPath);

  if (result.error) {
    throw new Error(`Failed to parse test file: ${result.error.message}`);
  }

  if (!result.document) {
    throw new Error('Failed to parse test file: empty document');
  }

  // Load all imported files from the test
  const resolvedImports = new Map<string, WflowDocument | TaskDocument | ActionDocument>();

  for (const [alias, imp] of result.imports.byAlias) {
    if (!imp.resolvedUri) continue;

    const importContent = fs.readFileSync(imp.resolvedUri, 'utf-8');
    let parsed: { document: WflowDocument | TaskDocument | ActionDocument | null };

    switch (imp.fileType) {
      case 'wflow':
        parsed = parseWorkflow(importContent, imp.resolvedUri);
        break;
      case 'task':
        parsed = parseTask(importContent, imp.resolvedUri);
        break;
      case 'action':
        parsed = parseAction(importContent, imp.resolvedUri);
        break;
      default:
        continue;
    }

    if (parsed.document) {
      resolvedImports.set(alias, parsed.document);
      // Recursively resolve this document's imports
      resolveDocumentImports(parsed.document, imp.resolvedUri, resolvedImports);
    }
  }

  // Create API client
  const baseUrl = options.baseUrl || process.env.WONDER_API_URL || 'https://api.wflow.app';
  const apiKey = options.apiKey || process.env.WONDER_API_KEY || process.env.API_KEY;
  const client = createClient(baseUrl, apiKey);

  return {
    doc: result.document,
    imports: result.imports,
    resolvedImports,
    basePath,
    client,
  };
}

// =============================================================================
// Test Execution
// =============================================================================

/**
 * Execute a single test case against the API
 */
async function executeTestCase(
  testName: string,
  testCase: TestCaseDecl,
  testContext: TestContext,
  options: TestRunOptions,
): Promise<TestCaseResult> {
  const startTime = Date.now();

  // Skip if marked
  if (testCase.skip) {
    return {
      name: testName,
      status: 'skipped',
      duration_ms: 0,
    };
  }

  // Get the target document
  const targetDoc = testContext.resolvedImports.get(testCase.target);
  if (!targetDoc) {
    return {
      name: testName,
      status: 'error',
      duration_ms: Date.now() - startTime,
      error: new Error(`Target '${testCase.target}' not found in imports`),
    };
  }

  // Only workflow execution is supported for now
  if (!('workflow' in targetDoc) || !targetDoc.workflow) {
    return {
      name: testName,
      status: 'error',
      duration_ms: Date.now() - startTime,
      error: new Error(
        `Target '${testCase.target}' is not a workflow. Only workflow tests are currently supported.`,
      ),
    };
  }

  let apiCtx: ApiTestContext | undefined;
  const resources: CreatedResources = {
    promptSpecIds: [],
    actionIds: [],
    taskIds: [],
  };

  try {
    // Setup API context
    apiCtx = await setupApiTestContext(testContext.client);

    // Transform workflow to SDK structure
    const embeddedWorkflow = transformWorkflow(targetDoc as WflowDocument, testContext);

    // Create workflow via API (mirrors kit.ts createWorkflow)
    const workflowDefResponse = await createWorkflowViaApi(
      testContext.client,
      apiCtx,
      embeddedWorkflow,
      resources,
    );

    resources.workflowDefId = workflowDefResponse.workflowDefId;

    // Create workflow instance
    const workflowResponse = await testContext.client.workflows.create({
      project_id: apiCtx.projectId,
      workflow_def_id: workflowDefResponse.workflowDefId,
      name: embeddedWorkflow.name,
      description: embeddedWorkflow.description || 'Test workflow',
    });

    resources.workflowId = workflowResponse.workflow.id;

    // Execute workflow
    const executionResult = await testContext.client
      .workflows(resources.workflowId)
      .stream(testCase.input || {}, {
        timeout: testCase.timeout_ms || options.timeout_ms || 60000,
        idleTimeout: 10000,
        onEvent: options.logEvents
          ? (event: Record<string, unknown>) => {
              if ('event_type' in event) {
                console.log(
                  `📨 ${event.event_type}`,
                  JSON.stringify(event.metadata ?? {}, null, 2),
                );
              }
            }
          : undefined,
      });

    resources.workflowRunId = executionResult.workflow_run_id;

    // Extract output from execution result
    const output = extractOutput(executionResult);

    // Evaluate assertions
    let assertionResults: AssertionResult[] = [];
    if (testCase.assert) {
      assertionResults = evaluateAssertions(testCase.assert, {
        status: executionResult.status,
        output,
        trace: executionResult.trace,
        events: executionResult.events,
      });
    }

    const allPassed = assertionResults.every((r) => r.passed);

    return {
      name: testName,
      status: allPassed ? 'passed' : 'failed',
      duration_ms: Date.now() - startTime,
      assertions: assertionResults,
      output,
      workflowRunId: executionResult.workflow_run_id,
    };
  } catch (error) {
    return {
      name: testName,
      status: 'error',
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    // Cleanup
    if (apiCtx) {
      await cleanupResources(testContext.client, apiCtx, resources);
    }
  }
}

/**
 * Create workflow and all embedded resources via API
 */
async function createWorkflowViaApi(
  client: WonderClient,
  apiCtx: ApiTestContext,
  embeddedWorkflow: EmbeddedWorkflowDef,
  resources: CreatedResources,
): Promise<{ workflowDefId: string }> {
  // Process nodes to create embedded resources
  const resolvedNodes: Array<{
    ref: string;
    name: string;
    task_id: string;
    task_version?: number;
    input_mapping?: Record<string, unknown>;
    output_mapping?: Record<string, unknown>;
    resource_bindings?: Record<string, unknown>;
  }> = [];

  for (const n of embeddedWorkflow.nodes as EmbeddedNode[]) {
    let taskId: string;

    if (n.task_id) {
      taskId = n.task_id;
    } else if (n.task) {
      taskId = await createEmbeddedTaskDef(client, apiCtx, n.task as EmbeddedTaskDef, resources);
    } else {
      throw new Error(`Node ${n.ref} must have either task_id or task`);
    }

    resolvedNodes.push({
      ref: n.ref,
      name: n.name,
      task_id: taskId,
      task_version: n.task_version,
      input_mapping: n.input_mapping,
      output_mapping: n.output_mapping,
      resource_bindings: n.resource_bindings,
    });
  }

  // Create workflow def
  const workflowDefResponse = await client.workflowDefs.create({
    ...embeddedWorkflow,
    project_id: apiCtx.projectId,
    nodes: resolvedNodes,
  } as any);

  if (!workflowDefResponse?.workflow_def_id) {
    throw new Error('Failed to create workflow definition');
  }

  return { workflowDefId: workflowDefResponse.workflow_def_id };
}

/**
 * Create embedded task def and its dependencies
 */
async function createEmbeddedTaskDef(
  client: WonderClient,
  apiCtx: ApiTestContext,
  taskDef: EmbeddedTaskDef,
  resources: CreatedResources,
): Promise<string> {
  const resolvedSteps: Array<{
    ref: string;
    ordinal: number;
    action_id: string;
    action_version: number;
    input_mapping?: Record<string, unknown> | null;
    output_mapping?: Record<string, unknown> | null;
    on_failure?: 'abort' | 'retry' | 'continue';
    condition?: {
      if: string;
      then: 'continue' | 'skip' | 'succeed' | 'fail';
      else: 'continue' | 'skip' | 'succeed' | 'fail';
    } | null;
  }> = [];

  for (const s of taskDef.steps as EmbeddedStep[]) {
    let actionId: string;
    let actionVersion: number;

    if (s.action_id) {
      // Reference to existing action - get latest version
      const actionResponse = await client.actions(s.action_id).get();
      actionId = actionResponse.action.id;
      actionVersion = actionResponse.action.version;
    } else if (s.action) {
      // Create embedded action and use returned version
      const result = await createEmbeddedAction(client, apiCtx, s.action as EmbeddedAction, resources);
      actionId = result.id;
      actionVersion = result.version;
    } else {
      throw new Error(`Step ${s.ref} must have either action_id or action`);
    }

    resolvedSteps.push({
      ref: s.ref,
      ordinal: s.ordinal,
      action_id: actionId,
      action_version: actionVersion,
      input_mapping: s.input_mapping ?? null,
      output_mapping: s.output_mapping ?? null,
      on_failure: s.on_failure ?? 'abort',
      condition: s.condition ?? null,
    });
  }

  const response = await client.tasks.create({
    name: taskDef.name,
    description: taskDef.description,
    version: taskDef.version ?? 1,
    project_id: apiCtx.projectId,
    input_schema: taskDef.input_schema,
    output_schema: taskDef.output_schema,
    steps: resolvedSteps,
    retry: taskDef.retry,
    timeout_ms: taskDef.timeout_ms,
  } as any);

  if (!response?.task?.id) {
    throw new Error('Failed to create task');
  }

  resources.taskIds.push(response.task.id);
  return response.task.id;
}

/**
 * Create embedded action and its dependencies
 */
async function createEmbeddedAction(
  client: WonderClient,
  apiCtx: ApiTestContext,
  actionDef: EmbeddedAction,
  resources: CreatedResources,
): Promise<{ id: string; version: number }> {
  const implementation = { ...actionDef.implementation };

  // Resolve embedded prompt spec
  if (implementation.prompt_spec) {
    const promptSpecId = await createEmbeddedPromptSpec(
      client,
      implementation.prompt_spec as EmbeddedPromptSpec,
      resources,
    );
    implementation.prompt_spec_id = promptSpecId;
    delete implementation.prompt_spec;
  }

  // Use context's model profile if not specified
  if (!implementation.model_profile_id) {
    implementation.model_profile_id = apiCtx.modelProfileId;
  }

  const response = await client.actions.create({
    name: actionDef.name,
    description: actionDef.description,
    version: actionDef.version ?? 1,
    kind: actionDef.kind,
    implementation,
    requires: actionDef.requires,
    produces: actionDef.produces,
    execution: actionDef.execution,
    idempotency: actionDef.idempotency,
  } as any);

  if (!response?.action?.id) {
    throw new Error('Failed to create action');
  }

  resources.actionIds.push(response.action.id);
  return { id: response.action.id, version: response.action.version };
}

/**
 * Create embedded prompt spec
 */
async function createEmbeddedPromptSpec(
  client: WonderClient,
  promptSpecDef: EmbeddedPromptSpec,
  resources: CreatedResources,
): Promise<string> {
  const response = await client.promptSpecs.create({
    name: promptSpecDef.name,
    description: promptSpecDef.description,
    version: promptSpecDef.version ?? 1,
    system_prompt: promptSpecDef.system_prompt,
    template: promptSpecDef.template,
    requires: promptSpecDef.requires,
    produces: promptSpecDef.produces,
    examples: promptSpecDef.examples,
    tags: promptSpecDef.tags,
  } as any);

  if (!response?.prompt_spec_id) {
    throw new Error('Failed to create prompt spec');
  }

  resources.promptSpecIds.push(response.prompt_spec_id);
  return response.prompt_spec_id;
}

/**
 * Extract output from execution result
 */
function extractOutput(result: {
  status: string;
  events: unknown[];
  trace: {
    context: {
      snapshots: () => Array<{ payload: { snapshot: { output?: unknown } } }>;
    };
  };
}): unknown {
  // Get the final snapshot from the trace - it contains the workflow output
  const snapshots = result.trace.context.snapshots();
  if (snapshots.length > 0) {
    const lastSnapshot = snapshots[snapshots.length - 1];
    return lastSnapshot.payload.snapshot.output;
  }
  return undefined;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Run all tests in a test file
 */
export async function runTestFile(
  filePath: string,
  options: TestRunOptions = {},
): Promise<TestSuiteResult> {
  const startTime = Date.now();

  // Load and parse
  const context = await loadTestFile(filePath, options);

  // Get tests to run
  const testsToRun = getTestsToRun(context.doc, options.filter, options.tags);

  // Run tests
  const results: TestCaseResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errorCount = 0;

  for (const testName of testsToRun) {
    const testCase = context.doc.tests?.[testName];
    if (!testCase) continue;

    const result = await executeTestCase(testName, testCase, context, options);
    results.push(result);

    switch (result.status) {
      case 'passed':
        passed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'error':
        errorCount++;
        break;
    }

    if (options.failFast && (result.status === 'failed' || result.status === 'error')) {
      break;
    }
  }

  return {
    suite: context.doc.test_suite || path.basename(filePath),
    file: filePath,
    tests: results,
    duration_ms: Date.now() - startTime,
    passed,
    failed,
    skipped,
    errors: errorCount,
  };
}

/**
 * Filter tests based on options
 */
function getTestsToRun(doc: TestDocument, filter?: string, tags?: string[]): string[] {
  if (!doc.tests) return [];

  let testNames = Object.keys(doc.tests);

  // Check for 'only' tests
  const onlyTests = testNames.filter((name) => doc.tests?.[name]?.only);
  if (onlyTests.length > 0) {
    testNames = onlyTests;
  }

  // Apply filter
  if (filter) {
    const filterLower = filter.toLowerCase();
    testNames = testNames.filter((name) => name.toLowerCase().includes(filterLower));
  }

  // Apply tags
  if (tags && tags.length > 0) {
    testNames = testNames.filter((name) => {
      const testTags = doc.tests?.[name]?.tags || [];
      return tags.some((t) => testTags.includes(t));
    });
  }

  return testNames;
}

/**
 * Run tests from multiple files
 */
export async function runTestFiles(
  filePaths: string[],
  options: TestRunOptions = {},
): Promise<TestSuiteResult[]> {
  const results: TestSuiteResult[] = [];

  for (const filePath of filePaths) {
    try {
      const result = await runTestFile(filePath, options);
      results.push(result);

      if (options.failFast && (result.failed > 0 || result.errors > 0)) {
        break;
      }
    } catch (error) {
      results.push({
        suite: path.basename(filePath),
        file: filePath,
        tests: [
          {
            name: 'load',
            status: 'error',
            duration_ms: 0,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        ],
        duration_ms: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 1,
      });

      if (options.failFast) break;
    }
  }

  return results;
}
