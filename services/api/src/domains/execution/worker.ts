/** Worker task handler - executes WorkflowTask from queue and returns results to DO */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { runInference } from '~/infrastructure/clients/workers-ai';
import * as aiRepo from '../ai/repository';
import * as effectsRepo from '../effects/repository';
import * as graphRepo from '../graph/repository';
import type { WorkflowTask, WorkflowTaskResult } from './definitions';

/**
 * Process a workflow task from the queue.
 * Executes the action and returns the result to the DO.
 */
export async function processWorkflowTask(
  task: WorkflowTask,
  env: {
    db: DrizzleD1Database;
    ai: Ai;
    WORKFLOW_COORDINATOR: DurableObjectNamespace;
  },
): Promise<void> {
  const startTime = Date.now();
  console.log('[Worker] Processing task', {
    task_id: task.task_id,
    workflow_run_id: task.workflow_run_id,
    token_id: task.token_id,
    node_id: task.node_id,
  });

  try {
    // Load node to get action_id and mappings
    const node = await graphRepo.getNode(env.db, task.node_id);
    if (!node) {
      throw new Error(`Node not found: ${task.node_id}`);
    }

    // Apply input_mapping to extract data from context
    let inputData: Record<string, unknown> = {};
    if (node.input_mapping && Object.keys(node.input_mapping).length > 0) {
      inputData = applyInputMapping(node.input_mapping as Record<string, string>, task.context);
    }

    // Load action
    const action = await effectsRepo.getAction(env.db, node.action_id);
    if (!action) {
      throw new Error(`Action not found: ${node.action_id}`);
    }

    // Execute action based on kind
    let outputData: Record<string, unknown>;

    if (action.kind === 'llm_call') {
      outputData = await executeLLMCall(env, action, inputData);
    } else {
      throw new Error(`Unsupported action kind: ${action.kind}`);
    }

    // Apply output mapping if present
    if (node.output_mapping && Object.keys(node.output_mapping).length > 0) {
      outputData = applyOutputMapping(node.output_mapping as Record<string, string>, outputData);
    }

    // Create success result
    const result: WorkflowTaskResult = {
      task_id: task.task_id,
      token_id: task.token_id,
      status: 'success',
      output_data: outputData,
      completed_at: new Date().toISOString(),
    };

    console.log('[Worker] Task completed successfully', {
      task_id: task.task_id,
      duration_ms: Date.now() - startTime,
    });

    // Send result to DO
    await sendResultToDO(task.durable_object_id, result, env.WORKFLOW_COORDINATOR);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Worker] Task execution failed', {
      task_id: task.task_id,
      error: errorMessage,
    });

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
    await sendResultToDO(task.durable_object_id, result, env.WORKFLOW_COORDINATOR);
  }
}

/**
 * Execute an LLM call action.
 */
async function executeLLMCall(
  env: { db: DrizzleD1Database; ai: Ai },
  action: NonNullable<Awaited<ReturnType<typeof effectsRepo.getAction>>>,
  inputData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const impl = action.implementation as {
    prompt_spec_id: string;
    model_profile_id: string;
  };

  // Load prompt spec and model profile
  const promptSpec = await aiRepo.getPromptSpec(env.db, impl.prompt_spec_id);
  if (!promptSpec) {
    throw new Error(`PromptSpec not found: ${impl.prompt_spec_id}`);
  }

  const modelProfile = await aiRepo.getModelProfile(env.db, impl.model_profile_id);
  if (!modelProfile) {
    throw new Error(`ModelProfile not found: ${impl.model_profile_id}`);
  }

  // Render prompt template
  const userPrompt = renderTemplate(promptSpec.template, inputData);

  // Build messages
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (promptSpec.system_prompt) {
    messages.push({ role: 'system', content: promptSpec.system_prompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  console.log('[Worker] Calling LLM', {
    model_id: modelProfile.model_id,
    prompt_spec_id: promptSpec.id,
    input_data: inputData,
    template: promptSpec.template,
    rendered_prompt: userPrompt,
  });

  // Call Workers AI
  const result = await runInference(env.ai, modelProfile.model_id as keyof AiModels, messages);

  console.log('[Worker] LLM call completed', {
    model_id: modelProfile.model_id,
    response_length: result.response.length,
    response: result.response,
  });

  return { response: result.response };
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

  for (const [targetPath, sourceKey] of Object.entries(mapping)) {
    // For Stage 0: simplified - just map directly
    // Target path like "summary" or "state.summary"
    const key = targetPath.startsWith('state.') ? targetPath.slice(6) : targetPath;

    // Source key may have $. prefix (JSONPath notation for "from result")
    const actualSourceKey = sourceKey.startsWith('$.') ? sourceKey.slice(2) : sourceKey;
    result[key] = actionResult[actualSourceKey];
  }

  return result;
}
/**
 * Render a template string with data.
 * For Stage 0: simple {{key}} replacement.
 */
function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value));
  }
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

    console.log('[Worker] Result sent to DO', {
      task_id: result.task_id,
      durable_object_id: durableObjectId,
    });
  } catch (err) {
    console.error('[Worker] Failed to send result to DO', {
      task_id: result.task_id,
      durable_object_id: durableObjectId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
