/**
 * Tasks Service
 *
 * Builds executor payloads for tokens.
 * Pure business logic - no direct SQL access.
 */

import type { Logger } from '@wonder/logs';
import type { Emitter, EventContext } from '@wonder/events';
import { renderTemplate } from './template';
import * as context from './context';

export interface BuildPayloadParams {
  token_id: string;
  node_id: string;
  workflow_run_id: string;
  sql: SqlStorage;
  env: Env;
  logger: Logger;
  emitter: Emitter;
}

/**
 * Build executor payload for a token
 * 
 * Fetches node, action, prompt spec, model profile from RESOURCES,
 * evaluates input_mapping, and renders template.
 */
export async function buildPayload(params: BuildPayloadParams): Promise<void> {
  const { token_id, node_id, workflow_run_id, sql, env, logger, emitter } = params;

  // Fetch workflow definition
  using workflowRuns = env.RESOURCES.workflowRuns();
  const workflowRun = await workflowRuns.get(workflow_run_id);

  using workflowDefs = env.RESOURCES.workflowDefs();
  const workflowDef = await workflowDefs.get(
    workflowRun.workflow_run.workflow_def_id,
    workflowRun.workflow_run.workflow_version,
  );

  const node = workflowDef.nodes.find((n: any) => n.id === node_id);

  if (!node) {
    throw new Error(`Node not found: ${node_id}`);
  }

  logger.info({
    event_type: 'node_fetched',
    message: 'Node retrieved from workflow definition',
    trace_id: workflow_run_id,
    metadata: {
      node_id: node.id,
      node_name: node.name,
      action_id: node.action_id,
      action_version: node.action_version,
    },
  });

  // Fetch the action definition
  using actions = env.RESOURCES.actions();
  const actionResult = await actions.get(node.action_id, node.action_version);

  logger.info({
    event_type: 'action_fetched',
    message: 'Action definition retrieved',
    trace_id: workflow_run_id,
    metadata: {
      action_id: actionResult.action.id,
      action_name: actionResult.action.name,
      action_kind: actionResult.action.kind,
      action_version: actionResult.action.version,
    },
  });

  // Route to appropriate executor action based on kind
  switch (actionResult.action.kind) {
    case 'llm_call': {
      const implementation = actionResult.action.implementation as any;
      
      // Fetch prompt spec
      using promptSpecs = env.RESOURCES.promptSpecs();
      const promptSpecResult = await promptSpecs.get(implementation.prompt_spec_id);

      logger.info({
        event_type: 'prompt_spec_fetched',
        message: 'Prompt spec retrieved',
        trace_id: workflow_run_id,
        metadata: {
          prompt_spec_id: promptSpecResult.prompt_spec.id,
          prompt_spec_name: promptSpecResult.prompt_spec.name,
          template: promptSpecResult.prompt_spec.template,
        },
      });

      // Fetch model profile
      using modelProfiles = env.RESOURCES.modelProfiles();
      const modelProfileResult = await modelProfiles.get(implementation.model_profile_id);

      logger.info({
        event_type: 'model_profile_fetched',
        message: 'Model profile retrieved',
        trace_id: workflow_run_id,
        metadata: {
          model_profile_id: modelProfileResult.model_profile.id,
          model_profile_name: modelProfileResult.model_profile.name,
          model_id: modelProfileResult.model_profile.model_id,
          parameters: modelProfileResult.model_profile.parameters,
        },
      });

      // Evaluate input_mapping to build template context
      const templateContext: Record<string, unknown> = {};
      if (node.input_mapping) {
        for (const [varName, jsonPath] of Object.entries(node.input_mapping)) {
          // Simple JSONPath evaluation for $.input.* and $.nodeId_output.*
          const pathStr = jsonPath as string;
          if (pathStr.startsWith('$.')) {
            const contextPath = pathStr.slice(2); // Remove $.
            const value = context.getContextValue(sql, contextPath);
            if (value !== undefined) {
              templateContext[varName] = value;
            }
          }
        }
      }

      logger.info({
        event_type: 'input_mapping_evaluated',
        message: 'Input mapping evaluated for prompt rendering',
        trace_id: workflow_run_id,
        metadata: {
          input_mapping: node.input_mapping,
          template_context: templateContext,
        },
      });

      // Render template with context
      const prompt = renderTemplate(promptSpecResult.prompt_spec.template, templateContext);

      // Build event context
      const eventContext: EventContext = {
        workflow_run_id,
        workspace_id: workflowRun.workflow_run.workspace_id,
        project_id: workflowRun.workflow_run.project_id,
        workflow_def_id: workflowRun.workflow_run.workflow_def_id,
        parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
      };

      // Emit node_started event
      emitter.emit(eventContext, {
        event_type: 'node_started',
        node_id: node.id,
        token_id,
        message: `Node ${node.name} started`,
      });

      logger.info({
        event_type: 'token_executing',
        message: 'Token status updated to executing',
        trace_id: workflow_run_id,
        metadata: {
          token_id,
          node_id: node.id,
          status: 'executing',
        },
      });

      // Fire-and-forget to executor - executor will callback to handleTaskResult
      env.EXECUTOR.llmCall({
        model_profile: modelProfileResult.model_profile,
        prompt,
        json_schema: promptSpecResult.prompt_spec.produces, // Pass output schema for structured output
        workflow_run_id,
        token_id,
      });

      // Emit llm_call_started event
      emitter.emit(eventContext, {
        event_type: 'llm_call_started',
        node_id: node.id,
        token_id,
        message: `LLM call started: ${modelProfileResult.model_profile.model_id}`,
        metadata: {
          model_id: modelProfileResult.model_profile.model_id,
          provider: modelProfileResult.model_profile.provider,
        },
      });

      logger.info({
        event_type: 'task_dispatched',
        message: 'Task dispatched to executor',
        trace_id: workflow_run_id,
        metadata: {
          token_id,
          node_id: node.id,
          action_kind: actionResult.action.kind,
          model_id: modelProfileResult.model_profile.model_id,
          provider: modelProfileResult.model_profile.provider,
          model_parameters: modelProfileResult.model_profile.parameters,
        },
      });

      return; // Don't wait - executor will callback
    }

    default:
      throw new Error(`Unsupported action kind: ${actionResult.action.kind}`);
  }
}
