/**
 * Minimal SDK for Wonderful Workflow API
 *
 * Note on WebSocket lifecycle:
 * WebSockets keep the Node.js event loop alive even after close() is called.
 * In CLI scripts, explicitly call process.exit() after consuming all events.
 * This is expected behavior - WebSockets maintain connections for bidirectional
 * communication and don't auto-terminate.
 */

// Type exports
export type * from './types/actions';
export type * from './types/model-profiles';
export type * from './types/projects';
export type * from './types/prompt-specs';
export type * from './types/workflow-defs';
export type * from './types/workflows';

// Resource imports
import { ActionsResource } from './resources/actions';
import { ModelProfilesResource } from './resources/model-profiles';
import { ProjectsResource } from './resources/projects';
import { PromptSpecsResource } from './resources/prompt-specs';
import { WorkflowDefsResource } from './resources/workflow-defs';
import { WorkflowsResource } from './resources/workflows';

export class WonderfulClient {
  public readonly projects: ProjectsResource;
  public readonly actions: ActionsResource;
  public readonly promptSpecs: PromptSpecsResource;
  public readonly modelProfiles: ModelProfilesResource;
  public readonly workflowDefs: WorkflowDefsResource;
  public readonly workflows: WorkflowsResource;

  constructor(baseUrl: string) {
    this.projects = new ProjectsResource(baseUrl);
    this.actions = new ActionsResource(baseUrl);
    this.promptSpecs = new PromptSpecsResource(baseUrl);
    this.modelProfiles = new ModelProfilesResource(baseUrl);
    this.workflowDefs = new WorkflowDefsResource(baseUrl);
    this.workflows = new WorkflowsResource(baseUrl);
  }
}
