/** Workflow execution service */

import {
  CustomTypeRegistry,
  Validator,
  type SchemaType,
  type ValidationResult,
} from '@wonder/schema';
import { NotFoundError, ValidationError } from '~/errors';
import { runInference } from '~/infrastructure/clients/workers-ai';
import type { ServiceContext } from '~/infrastructure/context';
import * as aiRepo from '../ai/repository';
import * as effectsRepo from '../effects/repository';
import * as eventsRepo from '../events/repository';
import * as graphRepo from '../graph/repository';
import type { Context, Event, EventKind, Token, WorkflowRun } from './definitions';
import * as execRepo from './repository';

/** Custom type registry for schema validation */

const customTypes = new CustomTypeRegistry();

// Register artifact_ref custom type (validates string format)
customTypes.register('artifact_ref', {
  validate: (value: unknown): boolean => {
    return typeof value === 'string' && value.length > 0;
  },
  description: 'Reference to an artifact (string ID)',
});

/** Domain types from other bounded contexts */

type WorkflowDef = Awaited<ReturnType<typeof graphRepo.getWorkflowDef>>;
type Node = Awaited<ReturnType<typeof graphRepo.getNode>>;
type Action = Awaited<ReturnType<typeof effectsRepo.getAction>>;

/** Internal execution context (not part of domain model) */

type ExecutionContext = {
  ctx: ServiceContext;
  workflowRun: WorkflowRun;
  workflowDef: WorkflowDef;
  context: Context;
  tokens: Token[];
  events: Event[];
  sequenceNumber: number;
};

/** Main Entry Point */

export async function executeWorkflow(
  ctx: ServiceContext,
  workflowId: string,
  input: Record<string, unknown>,
): Promise<WorkflowRun> {
  ctx.logger.info('workflow_execution_started', { workflow_id: workflowId });

  // Load workflow and definition
  const workflow = await graphRepo.getWorkflow(ctx.db, workflowId);
  if (!workflow) {
    ctx.logger.error('workflow_not_found', { workflow_id: workflowId });
    throw new NotFoundError(`Workflow not found: ${workflowId}`, 'workflow', workflowId);
  }

  const workflowDef = await graphRepo.getWorkflowDef(
    ctx.db,
    workflow.workflow_def_id,
    workflow.pinned_version ?? undefined,
  );
  if (!workflowDef) {
    ctx.logger.error('workflow_definition_not_found', {
      workflow_id: workflowId,
      workflow_def_id: workflow.workflow_def_id,
      version: workflow.pinned_version,
    });
    throw new NotFoundError(
      `Workflow definition not found: ${workflow.workflow_def_id}${
        workflow.pinned_version ? ` v${workflow.pinned_version}` : ''
      }`,
      'workflow_definition',
      workflow.workflow_def_id,
    );
  }

  // Validate input against schema
  const inputSchema = workflowDef.input_schema as SchemaType;
  const validator = new Validator(inputSchema, customTypes);
  const validationResult: ValidationResult = validator.validate(input);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
      .join('; ');
    ctx.logger.error('workflow_validation_failed', {
      workflow_id: workflowId,
      workflow_def_id: workflowDef.id,
      errors: validationResult.errors,
    });
    throw new ValidationError(
      `Invalid input: ${errorMessages}`,
      'input',
      'SCHEMA_VALIDATION_FAILED',
    );
  }

  // Initialize context
  const context: Context = {
    input,
    state: {},
    artifacts: {},
  };

  // Create workflow run (with empty tokens initially)
  const workflowRun = await execRepo.createWorkflowRun(ctx.db, {
    project_id: workflow.project_id,
    workflow_id: workflow.id,
    workflow_def_id: workflowDef.id,
    workflow_version: workflowDef.version,
    status: 'running',
    context: JSON.stringify(context),
    active_tokens: JSON.stringify([]),
    durable_object_id: 'do_placeholder', // Placeholder for Stage 0
    parent_run_id: null,
    parent_node_id: null,
  });

  // Create initial token via repository (generates ID and timestamps)
  const initialToken = await execRepo.createToken(ctx.db, {
    workflow_run_id: workflowRun.id,
    node_id: workflowDef.initial_node_id,
    status: 'active',
    path_id: workflowRun.id, // Use run ID as root path for Stage 0
    parent_token_id: null,
    fan_out_node_id: null,
    branch_index: 0,
    branch_total: 1,
  });

  // Initialize execution context
  const execContext: ExecutionContext = {
    ctx,
    workflowRun,
    workflowDef,
    context,
    tokens: [initialToken],
    events: [],
    sequenceNumber: 0,
  };

  // Emit workflow_started event
  emitEvent(execContext, 'workflow_started', {
    workflow_id: workflow.id,
    workflow_def_id: workflowDef.id,
    workflow_version: workflowDef.version,
    input,
  });

  try {
    // Execute initial token
    await executeToken(execContext, initialToken);

    // Persist events
    await persistEvents(execContext);

    // Update workflow run with final state
    await execRepo.updateWorkflowRunContext(ctx.db, workflowRun.id, execContext.context);
    await execRepo.updateWorkflowRunStatus(
      ctx.db,
      workflowRun.id,
      execContext.context.output ? 'completed' : 'running',
      execContext.context.output ? new Date().toISOString() : undefined,
    );

    const finalStatus = execContext.context.output ? 'completed' : 'running';
    if (finalStatus === 'completed') {
      ctx.logger.info('workflow_execution_completed', {
        workflow_id: workflowId,
        workflow_run_id: workflowRun.id,
        workflow_def_id: workflowDef.id,
      });
    }

    // Return updated workflow run
    return (await execRepo.getWorkflowRun(ctx.db, workflowRun.id))!;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger.error('workflow_execution_failed', {
      workflow_id: workflowId,
      workflow_run_id: workflowRun.id,
      workflow_def_id: workflowDef.id,
      error: errorMessage,
    });
    throw err;
  }
}

/** Token Execution */

async function executeToken(execCtx: ExecutionContext, token: Token): Promise<void> {
  // Load node
  const node = await graphRepo.getNode(execCtx.ctx.db, token.node_id);
  if (!node) {
    throw new Error(`Node not found: ${token.node_id}`);
  }

  // Emit node_started event
  emitEvent(execCtx, 'node_started', {
    token_id: token.id,
    node_id: node.id,
    node_name: node.name,
  });

  execCtx.ctx.logger.info('node_execution_started', {
    workflow_run_id: execCtx.workflowRun.id,
    node_id: node.id,
    node_name: node.name,
    token_id: token.id,
  });

  try {
    // Load action
    const action = await effectsRepo.getAction(execCtx.ctx.db, node.action_id);
    if (!action) {
      throw new Error(`Action not found: ${node.action_id}`);
    }

    // Execute action
    const actionResult = await executeAction(execCtx, action!, node!);

    // Apply output mapping
    if (node.output_mapping && Object.keys(node.output_mapping).length > 0) {
      applyOutputMapping(
        execCtx.context,
        node.output_mapping as Record<string, string>,
        actionResult,
      );
    }

    // Update token status
    token.status = 'completed';
    token.updated_at = new Date().toISOString();

    // Emit node_completed event
    emitEvent(execCtx, 'node_completed', {
      token_id: token.id,
      node_id: node.id,
      node_name: node.name,
      result: actionResult,
    });

    execCtx.ctx.logger.info('node_execution_completed', {
      workflow_run_id: execCtx.workflowRun.id,
      node_id: node.id,
      node_name: node.name,
      token_id: token.id,
    });

    // Check if terminal node
    if (await isTerminalNode(execCtx, node)) {
      await completeWorkflow(execCtx);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    execCtx.ctx.logger.error('node_execution_failed', {
      workflow_run_id: execCtx.workflowRun.id,
      node_id: node.id,
      node_name: node.name,
      token_id: token.id,
      error: errorMessage,
    });
    throw err;
  }
}

/** Action Execution */

async function executeAction(
  execCtx: ExecutionContext,
  action: NonNullable<Action>,
  node: NonNullable<Node>,
): Promise<Record<string, unknown>> {
  if (action.kind !== 'llm_call') {
    throw new Error(`Unsupported action kind: ${action.kind}`);
  }

  // Parse implementation
  const impl = action.implementation as {
    prompt_spec_id: string;
    model_profile_id: string;
  };

  // Load prompt spec and model profile
  const promptSpec = await aiRepo.getPromptSpec(execCtx.ctx.db, impl.prompt_spec_id);
  if (!promptSpec) {
    throw new Error(`PromptSpec not found: ${impl.prompt_spec_id}`);
  }

  const modelProfile = await aiRepo.getModelProfile(execCtx.ctx.db, impl.model_profile_id);
  if (!modelProfile) {
    throw new Error(`ModelProfile not found: ${impl.model_profile_id}`);
  }

  // Apply input mapping to get action input
  const actionInput =
    node.input_mapping && Object.keys(node.input_mapping).length > 0
      ? applyInputMapping(execCtx.context, node.input_mapping as Record<string, string>)
      : {};

  // Render prompt template (simplified for Stage 0 - just use template directly)
  const userPrompt = renderTemplate(promptSpec.template, actionInput);

  // Build messages
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (promptSpec.system_prompt) {
    messages.push({ role: 'system', content: promptSpec.system_prompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  // Call Workers AI
  execCtx.ctx.logger.info('llm_call_started', {
    workflow_run_id: execCtx.workflowRun.id,
    node_id: node.id,
    model_id: modelProfile.model_id,
    prompt_spec_id: promptSpec.id,
  });

  try {
    const result = await runInference(
      execCtx.ctx.ai,
      modelProfile.model_id as keyof AiModels,
      messages,
    );

    execCtx.ctx.logger.info('llm_call_completed', {
      workflow_run_id: execCtx.workflowRun.id,
      node_id: node.id,
      model_id: modelProfile.model_id,
      response_length: result.response.length,
    });

    return { response: result.response };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    execCtx.ctx.logger.error('llm_call_failed', {
      workflow_run_id: execCtx.workflowRun.id,
      node_id: node.id,
      model_id: modelProfile.model_id,
      error: errorMessage,
    });
    throw err;
  }
}

/** Input/Output Mapping */

function applyInputMapping(
  context: Context,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    result[targetKey] = resolvePath(context, sourcePath);
  }

  return result;
}

function applyOutputMapping(
  context: Context,
  mapping: Record<string, string>,
  actionResult: Record<string, unknown>,
): void {
  for (const [targetPath, sourceKey] of Object.entries(mapping)) {
    const value = actionResult[sourceKey];
    // Output mapping writes to context.state by default (unless path starts with 'state.')
    const fullPath = targetPath.startsWith('state.') ? targetPath : `state.${targetPath}`;
    setPath(context, fullPath, value);
  }
}

function resolvePath(context: Context, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function setPath(context: Context, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = context as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/** Template Rendering */

function renderTemplate(template: string, data: Record<string, unknown>): string {
  // Simplified template rendering for Stage 0
  // Just replace {{key}} with data[key]
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value));
  }
  return result;
}

/** Terminal Detection */

async function isTerminalNode(
  execCtx: ExecutionContext,
  node: NonNullable<Node>,
): Promise<boolean> {
  const allTransitions = await graphRepo.listTransitionsByWorkflowDef(
    execCtx.ctx.db,
    execCtx.workflowDef!.id,
  );
  const fromTransitions = allTransitions.filter((t) => t.from_node_id === node.id);
  return fromTransitions.length === 0;
}

/** Workflow Completion */

async function completeWorkflow(execCtx: ExecutionContext): Promise<void> {
  // Set output from state (for Stage 0, we'll just use the entire state as output)
  execCtx.context.output = { ...execCtx.context.state };

  // Validate output against schema
  const outputSchema = execCtx.workflowDef!.output_schema as SchemaType;
  const validator = new Validator(outputSchema, customTypes);
  const validationResult: ValidationResult = validator.validate(execCtx.context.output);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
      .join('; ');
    throw new Error(`Invalid output: ${errorMessages}`);
  }

  // Emit workflow_completed event
  emitEvent(execCtx, 'workflow_completed', {
    workflow_id: execCtx.workflowRun.workflow_id,
    output: execCtx.context.output,
  });
}

/** Event Management */

function emitEvent(
  execCtx: ExecutionContext,
  kind: EventKind,
  payload: Record<string, unknown>,
): void {
  execCtx.sequenceNumber++;
  execCtx.events.push({
    workflow_run_id: execCtx.workflowRun.id,
    sequence_number: execCtx.sequenceNumber,
    kind,
    payload,
  });
}

async function persistEvents(execCtx: ExecutionContext): Promise<void> {
  if (execCtx.events.length === 0) return;

  await eventsRepo.createEvents(
    execCtx.ctx.db,
    execCtx.events.map((e) => ({
      workflow_run_id: e.workflow_run_id,
      sequence_number: e.sequence_number,
      kind: e.kind,
      payload: JSON.stringify(e.payload),
      archived_at: null,
    })),
  );
}
