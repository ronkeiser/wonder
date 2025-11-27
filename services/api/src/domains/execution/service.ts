/** Workflow execution service - orchestrates workflow runs and coordination */

import {
  CustomTypeRegistry,
  Validator,
  type SchemaType,
  type ValidationResult,
} from '@wonder/schema';
import { NotFoundError, ValidationError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import * as graphRepo from '../graph/repository';
import { type Context, type WorkflowRun } from './definitions';
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

/**
 * Service context extended with DO namespace binding.
 */
export interface ExecutionServiceContext extends ServiceContext {
  WORKFLOW_COORDINATOR: DurableObjectNamespace;
}

/**
 * Start a workflow execution.
 * Creates a run in D1, gets a DO instance, and invokes DO.executeWorkflow().
 * Returns immediately - execution continues asynchronously in DO → Queue → Worker → DO.
 */
export async function startWorkflow(
  ctx: ExecutionServiceContext,
  workflowId: string,
  input: Record<string, unknown>,
): Promise<WorkflowRun> {
  ctx.logger.info('workflow_trigger_started', { workflow_id: workflowId });

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

  // Create a unique DO ID for this workflow run
  const doId = ctx.WORKFLOW_COORDINATOR.newUniqueId();
  const durableObjectId = doId.toString();

  // Create workflow run in D1
  const workflowRun = await execRepo.createWorkflowRun(ctx.db, {
    project_id: workflow.project_id,
    workflow_id: workflow.id,
    workflow_def_id: workflowDef.id,
    workflow_version: workflowDef.version,
    status: 'running',
    context: JSON.stringify(context),
    active_tokens: JSON.stringify([]),
    durable_object_id: durableObjectId,
    parent_run_id: null,
    parent_node_id: null,
  });

  ctx.logger.info('workflow_run_created', {
    workflow_run_id: workflowRun.id,
    durable_object_id: durableObjectId,
  });

  // Get DO stub and invoke executeWorkflow
  const doStub = ctx.WORKFLOW_COORDINATOR.get(doId);

  // Use waitUntil() to properly handle fire-and-forget DO invocation
  // This allows the DO work to continue after the response is returned
  const doInvocation = doStub
    .fetch('https://do/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowRunId: workflowRun.id,
        workflowDefId: workflowDef.id,
        workflowVersion: workflowDef.version,
        initialNodeId: workflowDef.initial_node_id,
        inputSchema: workflowDef.input_schema,
        outputSchema: workflowDef.output_schema,
        context,
      }),
    })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((errorText) => {
          ctx.logger.error('do_invocation_failed', {
            workflow_run_id: workflowRun.id,
            durable_object_id: durableObjectId,
            status: response.status,
            error: errorText,
          });
        });
      }
      ctx.logger.info('do_invocation_succeeded', {
        workflow_run_id: workflowRun.id,
        durable_object_id: durableObjectId,
      });
    })
    .catch((err) => {
      ctx.logger.error('do_invocation_exception', {
        workflow_run_id: workflowRun.id,
        durable_object_id: durableObjectId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  // Extend Worker lifetime to allow DO invocation to complete
  ctx.executionContext.waitUntil(doInvocation);

  ctx.logger.info('workflow_trigger_completed', {
    workflow_id: workflowId,
    workflow_run_id: workflowRun.id,
    durable_object_id: durableObjectId,
  });

  // Return the workflow run immediately
  // Execution continues asynchronously in DO
  return workflowRun;
}
