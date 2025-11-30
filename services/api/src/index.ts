/**
 * Wonder API Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { WorkflowTask } from './domains/execution/definitions';
import { handleFetch } from './handlers/fetch';
import { handleQueue } from './handlers/queue';
import { Actions } from './rpc/actions';
import { ModelProfiles } from './rpc/model-profiles';
import { Projects } from './rpc/projects';
import { PromptSpecs } from './rpc/prompt-specs';
import { WorkflowDefs } from './rpc/workflow-defs';
import { Workflows } from './rpc/workflows';
import { Workspaces } from './rpc/workspaces';

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './domains/coordination';

/**
 * Wonder API Entrypoint
 * Handles HTTP requests, queue messages, and provides RPC methods
 */
class WonderAPI extends WorkerEntrypoint<Env> {
  /**
   * RPC: Workspaces adapter
   */
  workspaces() {
    return new Workspaces(this.env, this.ctx);
  }

  /**
   * RPC: Projects adapter
   */
  projects() {
    return new Projects(this.env, this.ctx);
  }

  /**
   * RPC: WorkflowDefs adapter
   */
  workflowDefs() {
    return new WorkflowDefs(this.env, this.ctx);
  }

  /**
   * RPC: Workflows adapter
   */
  workflows() {
    return new Workflows(this.env, this.ctx);
  }

  /**
   * RPC: Actions adapter
   */
  actions() {
    return new Actions(this.env, this.ctx);
  }

  /**
   * RPC: PromptSpecs adapter
   */
  promptSpecs() {
    return new PromptSpecs(this.env, this.ctx);
  }

  /**
   * RPC: ModelProfiles adapter
   */
  modelProfiles() {
    return new ModelProfiles(this.env, this.ctx);
  }

  /**
   * HTTP fetch handler
   */
  async fetch(request: Request): Promise<Response> {
    return handleFetch(request, this.env, this.ctx);
  }

  /**
   * Queue consumer handler
   */
  async queue(batch: MessageBatch<WorkflowTask>): Promise<void> {
    return handleQueue(batch, this.env);
  }
}

// Export as both named and default for service binding compatibility
export { WonderAPI };
export default WonderAPI;
