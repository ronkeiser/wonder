/**
 * Wonder Resources Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleFetch } from './handlers/fetch';
import { Actions } from './resources/actions';
import { ModelProfiles } from './resources/model-profiles';
import { Projects } from './resources/projects';
import { PromptSpecs } from './resources/prompt-specs';
import { WorkflowDefs } from './resources/workflow-defs';
import { Workflows } from './resources/workflows';
import { Workspaces } from './resources/workspaces';

/**
 * Wonder Resources Entrypoint
 * Handles HTTP requests, queue messages, and provides RPC methods
 */
class WonderResources extends WorkerEntrypoint<Env> {
  /** RPC: Workspaces adapter */
  workspaces() {
    return new Workspaces(this.env, this.ctx);
  }

  /** RPC: Projects adapter */
  projects() {
    return new Projects(this.env, this.ctx);
  }

  /** RPC: WorkflowDefs adapter */
  workflowDefs() {
    return new WorkflowDefs(this.env, this.ctx);
  }

  /** RPC: Workflows adapter */
  workflows() {
    return new Workflows(this.env, this.ctx);
  }

  /** RPC: Actions adapter */
  actions() {
    return new Actions(this.env, this.ctx);
  }

  /** RPC: PromptSpecs adapter */
  promptSpecs() {
    return new PromptSpecs(this.env, this.ctx);
  }

  /** RPC: ModelProfiles adapter */
  modelProfiles() {
    return new ModelProfiles(this.env, this.ctx);
  }

  /** HTTP fetch handler */
  async fetch(request: Request): Promise<Response> {
    return handleFetch(request, this.env, this.ctx);
  }
}

// Export as both named and default for service binding compatibility
export { WonderResources };
export default WonderResources;
