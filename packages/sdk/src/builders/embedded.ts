/**
 * Embedded resource markers for test workflow composition
 *
 * These symbols and types allow builders to accept either:
 * - An ID string (for existing resources)
 * - An embedded builder object (to be created by createWorkflow)
 *
 * The createWorkflow helper detects embedded objects, creates them in
 * dependency order, and wires up the IDs.
 */

/** Symbol to mark embedded prompt specs */
export const PROMPT_SPEC = Symbol('promptSpec');

/** Symbol to mark embedded actions */
export const ACTION = Symbol('action');

/** Symbol to mark embedded task defs */
export const TASK_DEF = Symbol('taskDef');

/** Symbol to mark embedded model profiles */
export const MODEL_PROFILE = Symbol('modelProfile');

import type { JSONSchema } from '@wonder/schemas';
import type { components } from '../generated/schema';

type CreatePromptSpec = components['schemas']['CreatePromptSpec'];
type CreateAction = components['schemas']['CreateAction'];
type CreateTask = components['schemas']['CreateTask'];
type CreateModelProfile = components['schemas']['CreateModelProfile'];

/** Embedded prompt spec with type marker */
export interface EmbeddedPromptSpec {
  [PROMPT_SPEC]: true;
  name: string;
  description: string;
  version?: number;
  systemPrompt?: string;
  template: string;
  requires: Record<string, unknown>;
  produces: JSONSchema;
  examples?: unknown[];
  tags?: string[];
}

/** Embedded action with type marker, can reference embedded prompt spec */
export interface EmbeddedAction extends Omit<CreateAction, 'implementation'> {
  [ACTION]: true;
  implementation: {
    promptSpecId?: string;
    promptSpec?: EmbeddedPromptSpec;
    modelProfileId?: string;
    modelProfile?: EmbeddedModelProfile;
    [key: string]: unknown;
  };
}

/** Embedded task def with type marker */
export interface EmbeddedTask extends Omit<CreateTask, 'steps'> {
  [TASK_DEF]: true;
  steps: EmbeddedStep[];
}

/** Embedded step that can reference embedded action */
export interface EmbeddedStep {
  ref: string;
  ordinal: number;
  actionId?: string;
  action?: EmbeddedAction;
  inputMapping?: Record<string, unknown> | null;
  outputMapping?: Record<string, unknown> | null;
  onFailure?: 'abort' | 'retry' | 'continue';
  condition?: {
    if: string;
    then: 'continue' | 'skip' | 'succeed' | 'fail';
    else: 'continue' | 'skip' | 'succeed' | 'fail';
  } | null;
}

/** Embedded model profile with type marker */
export interface EmbeddedModelProfile extends CreateModelProfile {
  [MODEL_PROFILE]: true;
}

/** Embedded node that can reference embedded task def or subworkflow */
export interface EmbeddedNode {
  ref: string;
  name: string;
  // Task execution (mutually exclusive with subworkflowId)
  taskId?: string;
  task?: EmbeddedTask;
  taskVersion?: number;
  // Subworkflow execution (mutually exclusive with taskId/task)
  subworkflowId?: string;
  subworkflow?: EmbeddedWorkflowDef;
  subworkflowVersion?: number;
  // Common
  inputMapping?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  resourceBindings?: Record<string, unknown>;
}

/** Symbol to mark embedded workflow defs */
export const WORKFLOW_DEF = Symbol('workflowDef');

type CreateWorkflowDef = components['schemas']['CreateWorkflowDef'];

/** Embedded workflow def that can contain embedded nodes */
export interface EmbeddedWorkflowDef extends Omit<CreateWorkflowDef, 'nodes'> {
  [WORKFLOW_DEF]: true;
  nodes: EmbeddedNode[];
}

/** Type guards */
export function isEmbeddedPromptSpec(obj: unknown): obj is EmbeddedPromptSpec {
  return typeof obj === 'object' && obj !== null && PROMPT_SPEC in obj;
}

export function isEmbeddedAction(obj: unknown): obj is EmbeddedAction {
  return typeof obj === 'object' && obj !== null && ACTION in obj;
}

export function isEmbeddedTask(obj: unknown): obj is EmbeddedTask {
  return typeof obj === 'object' && obj !== null && TASK_DEF in obj;
}

export function isEmbeddedModelProfile(obj: unknown): obj is EmbeddedModelProfile {
  return typeof obj === 'object' && obj !== null && MODEL_PROFILE in obj;
}

export function isEmbeddedWorkflowDef(obj: unknown): obj is EmbeddedWorkflowDef {
  return typeof obj === 'object' && obj !== null && WORKFLOW_DEF in obj;
}

export function isEmbeddedNode(obj: unknown): obj is EmbeddedNode {
  return typeof obj === 'object' && obj !== null && 'ref' in obj && 'task' in obj;
}
