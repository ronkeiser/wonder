/**
 * Wonder Resources Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Actions } from './resources/actions';
import { Agents } from './resources/agents';
import { Conversations } from './resources/conversations';
import { Messages } from './resources/messages';
import { ModelProfiles } from './resources/model-profiles';
import { Personas } from './resources/personas';
import { Projects } from './resources/projects';
import { PromptSpecs } from './resources/prompt-specs';
import { Tasks } from './resources/tasks';
import { Tools } from './resources/tools';
import { Turns } from './resources/turns';
import { WorkflowDefs } from './resources/workflow-defs';
import { WorkflowRuns } from './resources/workflow-runs';
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

  /** RPC: WorkflowRuns adapter */
  workflowRuns() {
    return new WorkflowRuns(this.env, this.ctx);
  }

  /** RPC: Actions adapter */
  actions() {
    return new Actions(this.env, this.ctx);
  }

  /** RPC: Tasks adapter */
  tasks() {
    return new Tasks(this.env, this.ctx);
  }

  /** RPC: PromptSpecs adapter */
  promptSpecs() {
    return new PromptSpecs(this.env, this.ctx);
  }

  /** RPC: ModelProfiles adapter */
  modelProfiles() {
    return new ModelProfiles(this.env, this.ctx);
  }

  /** RPC: Personas adapter */
  personas() {
    return new Personas(this.env, this.ctx);
  }

  /** RPC: Tools adapter */
  tools() {
    return new Tools(this.env, this.ctx);
  }

  /** RPC: Agents adapter */
  agents() {
    return new Agents(this.env, this.ctx);
  }

  /** RPC: Conversations adapter */
  conversations() {
    return new Conversations(this.env, this.ctx);
  }

  /** RPC: Turns adapter */
  turns() {
    return new Turns(this.env, this.ctx);
  }

  /** RPC: Messages adapter */
  messages() {
    return new Messages(this.env, this.ctx);
  }

  /** HTTP fetch handler */
  fetch(): Response {
    return new Response('OK');
  }
}

// Export as both named and default for service binding compatibility
export { WonderResources };
export default WonderResources;
