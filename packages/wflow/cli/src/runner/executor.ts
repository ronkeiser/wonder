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
  type EmbeddedTask,
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
  durationMs: number;
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
  durationMs: number;
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
  timeoutMs?: number;
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
// SSE Workflow Execution
// =============================================================================

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Result of workflow execution via SSE
 */
interface SSEExecutionResult {
  workflowRunId: string;
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: Array<Record<string, unknown>>;
  traceEvents: Array<Record<string, unknown>>;
  trace: {
    context: {
      snapshots: () => Array<{ payload: { snapshot: { output?: unknown } } }>;
    };
  };
}

/**
 * Execute a workflow via SSE streaming using the generated SDK method
 */
async function executeWorkflowSSE(
  client: WonderClient,
  workflowId: string,
  inputData: unknown,
  options?: {
    timeout?: number;
    idleTimeout?: number;
    logEvents?: boolean;
  },
): Promise<SSEExecutionResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS;

  const events: Array<Record<string, unknown>> = [];
  const traceEvents: Array<Record<string, unknown>> = [];
  let workflowRunId: string | null = null;
  let status: SSEExecutionResult['status'] = 'timeout';

  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout) {
      idleTimer = setTimeout(() => {
        status = 'idle_timeout';
        timedOut = true;
      }, idleTimeout);
    }
  };

  // Set up total timeout
  if (timeout) {
    totalTimer = setTimeout(() => {
      timedOut = true;
    }, timeout);
  }

  resetIdleTimer();

  try {
    // Use the generated SDK method - returns AsyncGenerator<WorkflowSSEEvent>
    const stream = client.workflows(workflowId).start({
      stream: true,
      input: inputData as Record<string, unknown>,
    });

    for await (const sseEvent of stream) {
      if (timedOut) break;

      resetIdleTimer();

      // Collect events by stream type
      if (sseEvent.stream === 'trace') {
        const traceEvent = sseEvent.event as Record<string, unknown>;
        traceEvents.push(traceEvent);

        if (options?.logEvents) {
          console.log(`🔍 ${traceEvent.type}`, JSON.stringify(traceEvent.payload ?? {}, null, 2));
        }
      } else {
        const event = sseEvent.event as Record<string, unknown>;
        events.push(event);

        if (options?.logEvents) {
          console.log(`📨 ${event.eventType}`, event.metadata);
        }

        // Extract workflowRunId from workflow.started event
        if (event.eventType === 'workflow.started') {
          workflowRunId = event.executionId as string;
        }

        // Check for terminal conditions
        if (event.eventType === 'workflow.completed') {
          status = 'completed';
          break;
        }
        if (event.eventType === 'workflow.failed') {
          status = 'failed';
          break;
        }
      }
    }
  } finally {
    if (totalTimer) clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }

  if (!workflowRunId) {
    throw new Error('Never received workflowRunId from workflow.started event');
  }

  // Build trace accessor for compatibility with existing code
  const trace = {
    context: {
      snapshots: () =>
        traceEvents
          .filter((e) => e.type === 'context.snapshot')
          .map((e) => ({
            payload: { snapshot: (e.payload as Record<string, unknown>) ?? {} },
          })),
    },
  };

  return {
    workflowRunId,
    status,
    events,
    traceEvents,
    trace,
  };
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
    workspaceId: workspaceId,
    name: `wflow-test-project-${Date.now()}`,
    description: 'Auto-created by wflow test CLI',
  });
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await client.modelProfiles.create({
    name: `wflow-test-model-${Date.now()}`,
    provider: 'cloudflare',
    modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    parameters: {
      maxTokens: 512,
      temperature: 1.0,
    },
    costPer1kInputTokens: 0.0,
    costPer1kOutputTokens: 0.0,
  });
  const modelProfileId = modelProfileResponse.modelProfile.id;

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
  let kind = actionDoc.kind || 'llm';

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
    // Note: Parser may produce inputSchema/outputSchema instead of requires/produces
    const inputSchema = (actionDoc as any).inputSchema || actionDoc.requires;
    const outputSchema = (actionDoc as any).outputSchema || actionDoc.produces;

    const embeddedPrompt = promptSpec({
      name: `${actionDoc.action || 'action'}-prompt`,
      description: actionDoc.description || 'Auto-generated prompt spec',
      template,
      requires: transformSchema(inputSchema) as Record<string, unknown>,
      produces: transformSchema(outputSchema) as any,
    });

    impl = { prompt_spec: embeddedPrompt };
    kind = 'llm';
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
    kind = 'llm';
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
 * Transform TaskDocument to EmbeddedTask
 */
function transformTask(taskDoc: TaskDocument, testContext: TestContext): EmbeddedTask {
  const embeddedSteps: EmbeddedStep[] = [];

  if (taskDoc.steps) {
    for (const stepDoc of taskDoc.steps) {
      let embeddedAction: EmbeddedAction | undefined;

      // Resolve action reference
      if (stepDoc.actionId) {
        const actionDoc = testContext.resolvedImports.get(stepDoc.actionId);
        if (actionDoc && 'action' in actionDoc) {
          embeddedAction = transformAction(actionDoc as ActionDocument, testContext);
        }
      }

      embeddedSteps.push(
        step({
          ref: stepDoc.ref || `step-${stepDoc.ordinal || 0}`,
          ordinal: stepDoc.ordinal || 0,
          action: embeddedAction,
          inputMapping: stepDoc.inputMapping,
          outputMapping: stepDoc.outputMapping,
          onFailure: stepDoc.onFailure,
          condition: stepDoc.condition,
        }),
      );
    }
  }

  return task({
    name: taskDoc.task || taskDoc.name || 'unnamed-task',
    description: taskDoc.description || '',
    version: taskDoc.version || 1,
    inputSchema: transformSchema(taskDoc.inputSchema) as any,
    outputSchema: transformSchema(taskDoc.outputSchema) as any,
    steps: embeddedSteps,
    retry: taskDoc.retry as any,
    timeoutMs: taskDoc.timeoutMs,
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
      if (!nodeDoc.taskId) {
        throw new Error(`Node '${nodeRef}' must have a taskId`);
      }

      const taskDoc = testContext.resolvedImports.get(nodeDoc.taskId);
      if (!taskDoc || !('task' in taskDoc)) {
        throw new Error(
          `Task '${nodeDoc.taskId}' not found for node '${nodeRef}'. Available imports: ${[...testContext.resolvedImports.keys()].join(', ')}`,
        );
      }

      const embeddedTask = transformTask(taskDoc as TaskDocument, testContext);

      embeddedNodes.push(
        node({
          ref: nodeDoc.ref || nodeRef,
          name: nodeDoc.name || nodeRef,
          task: embeddedTask,
          taskVersion: nodeDoc.taskVersion || 1,
          inputMapping: nodeDoc.inputMapping as Record<string, unknown> | undefined,
          outputMapping: nodeDoc.outputMapping as Record<string, unknown> | undefined,
          resourceBindings: nodeDoc.resourceBindings as Record<string, unknown> | undefined,
        }),
      );
    }
  }

  // Transform transitions
  const transitions = wflowDoc.transitions
    ? Object.values(wflowDoc.transitions).map((t) => ({
        fromNodeRef: t.fromNodeRef || '',
        toNodeRef: t.toNodeRef || '',
        priority: t.priority || 1,
        condition: t.condition?.expr,
      }))
    : [];

  return workflow({
    name: wflowDoc.workflow || 'unnamed-workflow',
    description: wflowDoc.description || '',
    inputSchema: transformSchema(wflowDoc.inputSchema) as any,
    outputSchema: transformSchema(wflowDoc.outputSchema) as any,
    contextSchema: transformSchema(wflowDoc.contextSchema) as any,
    outputMapping: wflowDoc.outputMapping,
    initialNodeRef: wflowDoc.initialNodeRef || '',
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
      durationMs: 0,
    };
  }

  // Get the target document
  const targetDoc = testContext.resolvedImports.get(testCase.target);
  if (!targetDoc) {
    return {
      name: testName,
      status: 'error',
      durationMs: Date.now() - startTime,
      error: new Error(`Target '${testCase.target}' not found in imports`),
    };
  }

  // Only workflow execution is supported for now
  if (!('workflow' in targetDoc) || !targetDoc.workflow) {
    return {
      name: testName,
      status: 'error',
      durationMs: Date.now() - startTime,
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
      projectId: apiCtx.projectId,
      definitionId: workflowDefResponse.workflowDefId,
      name: embeddedWorkflow.name,
      description: embeddedWorkflow.description || 'Test workflow',
    });

    resources.workflowId = workflowResponse.workflow.id;

    // Execute workflow via SSE streaming
    const executionResult = await executeWorkflowSSE(
      testContext.client,
      resources.workflowId,
      testCase.input || {},
      {
        timeout: testCase.timeoutMs || options.timeoutMs || 60000,
        idleTimeout: 10000,
        logEvents: options.logEvents,
      },
    );

    resources.workflowRunId = executionResult.workflowRunId;

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
      durationMs: Date.now() - startTime,
      assertions: assertionResults,
      output,
      workflowRunId: executionResult.workflowRunId,
    };
  } catch (error) {
    return {
      name: testName,
      status: 'error',
      durationMs: Date.now() - startTime,
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
    taskId: string;
    taskVersion?: number;
    inputMapping?: Record<string, unknown>;
    outputMapping?: Record<string, unknown>;
    resourceBindings?: Record<string, unknown>;
  }> = [];

  for (const n of embeddedWorkflow.nodes as EmbeddedNode[]) {
    let taskId: string;

    if (n.taskId) {
      taskId = n.taskId;
    } else if (n.task) {
      taskId = await createEmbeddedTask(client, apiCtx, n.task as EmbeddedTask, resources);
    } else {
      throw new Error(`Node ${n.ref} must have either taskId or task`);
    }

    resolvedNodes.push({
      ref: n.ref,
      name: n.name,
      taskId: taskId,
      taskVersion: n.taskVersion,
      inputMapping: n.inputMapping,
      outputMapping: n.outputMapping,
      resourceBindings: n.resourceBindings,
    });
  }

  // Create workflow def
  const workflowDefResponse = await client.workflowDefs.create({
    ...embeddedWorkflow,
    projectId: apiCtx.projectId,
    nodes: resolvedNodes,
  } as any);

  if (!workflowDefResponse?.workflowDefId) {
    throw new Error('Failed to create workflow definition');
  }

  return { workflowDefId: workflowDefResponse.workflowDefId };
}

/**
 * Create embedded task def and its dependencies
 */
async function createEmbeddedTask(
  client: WonderClient,
  apiCtx: ApiTestContext,
  taskDef: EmbeddedTask,
  resources: CreatedResources,
): Promise<string> {
  const resolvedSteps: Array<{
    ref: string;
    ordinal: number;
    actionId: string;
    actionVersion: number;
    inputMapping?: Record<string, unknown> | null;
    outputMapping?: Record<string, unknown> | null;
    onFailure?: 'abort' | 'retry' | 'continue';
    condition?: {
      if: string;
      then: 'continue' | 'skip' | 'succeed' | 'fail';
      else: 'continue' | 'skip' | 'succeed' | 'fail';
    } | null;
  }> = [];

  for (const s of taskDef.steps as EmbeddedStep[]) {
    let actionId: string;
    let actionVersion: number;

    if (s.actionId) {
      // Reference to existing action - get latest version
      const actionResponse = await client.actions(s.actionId).get();
      actionId = actionResponse.action.id;
      actionVersion = actionResponse.action.version;
    } else if (s.action) {
      // Create embedded action and use returned version
      const result = await createEmbeddedAction(
        client,
        apiCtx,
        s.action as EmbeddedAction,
        resources,
      );
      actionId = result.id;
      actionVersion = result.version;
    } else {
      throw new Error(`Step ${s.ref} must have either actionId or action`);
    }

    resolvedSteps.push({
      ref: s.ref,
      ordinal: s.ordinal,
      actionId: actionId,
      actionVersion: actionVersion,
      inputMapping: s.inputMapping ?? null,
      outputMapping: s.outputMapping ?? null,
      onFailure: s.onFailure ?? 'abort',
      condition: s.condition ?? null,
    });
  }

  const response = await client.tasks.create({
    name: taskDef.name,
    description: taskDef.description,
    version: taskDef.version ?? 1,
    projectId: apiCtx.projectId,
    inputSchema: taskDef.inputSchema,
    outputSchema: taskDef.outputSchema,
    steps: resolvedSteps,
    retry: taskDef.retry,
    timeoutMs: taskDef.timeoutMs,
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
    implementation.promptSpecId = promptSpecId;
    delete implementation.prompt_spec;
  }

  // Use context's model profile if not specified
  if (!implementation.modelProfileId) {
    implementation.modelProfileId = apiCtx.modelProfileId;
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
    systemPrompt: promptSpecDef.systemPrompt,
    template: promptSpecDef.template,
    requires: promptSpecDef.requires,
    produces: promptSpecDef.produces,
    examples: promptSpecDef.examples,
    tags: promptSpecDef.tags,
  } as any);

  if (!response?.promptSpecId) {
    throw new Error('Failed to create prompt spec');
  }

  resources.promptSpecIds.push(response.promptSpecId);
  return response.promptSpecId;
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
    suite: context.doc.testSuite || path.basename(filePath),
    file: filePath,
    tests: results,
    durationMs: Date.now() - startTime,
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
            durationMs: 0,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        ],
        durationMs: 0,
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
