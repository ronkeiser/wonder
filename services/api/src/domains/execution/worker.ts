/** Worker task handler - executes WorkflowTask from queue and returns results to DO */

import type { ServiceContext } from '~/infrastructure/context';
import * as aiExecutors from '../ai/executors';
import * as effectsService from '../effects/service';
import * as graphService from '../graph/service';
import type { WorkflowTask, WorkflowTaskResult } from './definitions';

/**
 * Process a workflow task from the queue.
 * Executes the action and returns the result to the DO.
 */
export async function processWorkflowTask(
  task: WorkflowTask,
  ctx: ServiceContext,
  coordinatorNamespace: DurableObjectNamespace,
): Promise<void> {
  const startTime = Date.now();

  try {
    // Load node to get action_id and mappings
    const node = await graphService.getNode(
      ctx,
      task.workflow_def_id,
      task.workflow_def_version,
      task.node_id,
    );

    // Apply input_mapping to extract data from context
    console.log('Task context:', JSON.stringify(task.context));
    console.log('Node input_mapping:', JSON.stringify(node.input_mapping));

    let inputData: Record<string, unknown> = {};
    if (node.input_mapping && Object.keys(node.input_mapping).length > 0) {
      // Parse input_mapping if it's a string (Drizzle JSON mode not working in queue consumer)
      const mapping =
        typeof node.input_mapping === 'string'
          ? JSON.parse(node.input_mapping)
          : node.input_mapping;

      inputData = applyInputMapping(mapping as Record<string, string>, task.context);
    }

    console.log('Extracted inputData:', JSON.stringify(inputData));

    // Load action
    const action = await effectsService.getAction(ctx, node.action_id);

    // Execute action based on kind
    let outputData: Record<string, unknown>;

    if (action.kind === 'llm_call') {
      outputData = await aiExecutors.executeLLMCall(ctx, action, inputData);
      console.log('Action result:', JSON.stringify(outputData));
    } else {
      throw new Error(`Unsupported action kind: ${action.kind}`);
    }

    // Apply output mapping if present
    if (node.output_mapping && Object.keys(node.output_mapping).length > 0) {
      console.log('Before output mapping:', JSON.stringify(outputData));
      console.log('Output mapping:', JSON.stringify(node.output_mapping));

      // Parse output_mapping if it's a string (Drizzle JSON mode not working in queue consumer)
      const mapping =
        typeof node.output_mapping === 'string'
          ? JSON.parse(node.output_mapping)
          : node.output_mapping;

      outputData = applyOutputMapping(mapping as Record<string, string>, outputData);
      console.log('After output mapping:', JSON.stringify(outputData));
    }

    // Create success result
    const result: WorkflowTaskResult = {
      task_id: task.task_id,
      token_id: task.token_id,
      status: 'success',
      output_data: outputData,
      completed_at: new Date().toISOString(),
    };

    // Send result to DO
    await sendResultToDO(task.durable_object_id, result, coordinatorNamespace);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Create failure result
    const result: WorkflowTaskResult = {
      task_id: task.task_id,
      token_id: task.token_id,
      status: 'failure',
      error: {
        message: errorMessage,
        retryable: false, // For Stage 0, no retries
      },
      completed_at: new Date().toISOString(),
    };

    // Send failure result to DO
    await sendResultToDO(task.durable_object_id, result, coordinatorNamespace);
  }
}

/**
 * Apply input mapping to extract data from context.
 */
function applyInputMapping(
  mapping: Record<string, string>,
  context: import('./definitions').Context,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetKey, sourcePath] of Object.entries(mapping)) {
    // Source path like "$.input.name" or "$.state.summary"
    const actualPath = sourcePath.startsWith('$.') ? sourcePath.slice(2) : sourcePath;
    const pathParts = actualPath.split('.');

    // Navigate context to extract value
    let value: any = context;
    for (const part of pathParts) {
      value = value?.[part];
    }

    result[targetKey] = value;
  }

  return result;
}

/**
 * Apply output mapping to transform action output to context paths.
 */
function applyOutputMapping(
  mapping: Record<string, string>,
  actionResult: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  console.log('applyOutputMapping - actionResult type:', typeof actionResult);
  console.log('applyOutputMapping - actionResult keys:', Object.keys(actionResult));
  console.log('applyOutputMapping - actionResult:', JSON.stringify(actionResult));
  console.log('applyOutputMapping - mapping:', JSON.stringify(mapping));

  for (const [targetPath, sourceKey] of Object.entries(mapping)) {
    // For Stage 0: simplified - just map directly
    // Target path like "summary" or "state.summary"
    const key = targetPath.startsWith('state.') ? targetPath.slice(6) : targetPath;

    // Source key may have $. prefix (JSONPath notation for "from result")
    const actualSourceKey = sourceKey.startsWith('$.') ? sourceKey.slice(2) : sourceKey;

    console.log(
      `Mapping: target="${targetPath}" -> key="${key}", source="${sourceKey}" -> actualSourceKey="${actualSourceKey}"`,
    );
    console.log(`Value at actionResult["${actualSourceKey}"]:`, actionResult[actualSourceKey]);

    result[key] = actionResult[actualSourceKey];
  }

  console.log('applyOutputMapping result:', JSON.stringify(result));
  return result;
}

/**
 * Send task result back to the DO via fetch.
 */
async function sendResultToDO(
  durableObjectId: string,
  result: WorkflowTaskResult,
  namespace: DurableObjectNamespace,
): Promise<void> {
  try {
    // Get DO stub from ID
    const id = namespace.idFromString(durableObjectId);
    const stub = namespace.get(id);

    // Send result
    const response = await stub.fetch('https://do/task-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      throw new Error(`DO returned ${response.status}: ${await response.text()}`);
    }
  } catch (err) {
    throw err;
  }
}
