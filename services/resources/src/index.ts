/**
 * Wonder Resources Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Actions } from './resources/actions';
import { Agents } from './resources/agents';
import { ArtifactTypes } from './resources/artifact-types';
import { Conversations } from './resources/conversations';
import { Libraries } from './resources/libraries';
import { ModelProfiles } from './resources/model-profiles';
import { Personas } from './resources/personas';
import { Projects } from './resources/projects';
import { PromptSpecs } from './resources/prompt-specs';
import { Tasks } from './resources/tasks';
import { Tools } from './resources/tools';
import { WorkflowDefs } from './resources/workflow-defs';
import { WorkflowRuns } from './resources/workflow-runs';
import { Workflows } from './resources/workflows';
import { Workspaces } from './resources/workspaces';

/**
 * Wonder Resources Entrypoint
 * Handles HTTP requests, queue messages, and provides RPC methods
 */
class WonderResources extends WorkerEntrypoint<Env> {
  actions() {
    return new Actions(this.env, this.ctx);
  }

  agents() {
    return new Agents(this.env, this.ctx);
  }

  artifactTypes() {
    return new ArtifactTypes(this.env, this.ctx);
  }

  conversations() {
    return new Conversations(this.env, this.ctx);
  }

  libraries() {
    return new Libraries(this.env, this.ctx);
  }

  modelProfiles() {
    return new ModelProfiles(this.env, this.ctx);
  }

  personas() {
    return new Personas(this.env, this.ctx);
  }

  projects() {
    return new Projects(this.env, this.ctx);
  }

  promptSpecs() {
    return new PromptSpecs(this.env, this.ctx);
  }

  tasks() {
    return new Tasks(this.env, this.ctx);
  }

  tools() {
    return new Tools(this.env, this.ctx);
  }

  workflowDefs() {
    return new WorkflowDefs(this.env, this.ctx);
  }

  workflowRuns() {
    return new WorkflowRuns(this.env, this.ctx);
  }

  workflows() {
    return new Workflows(this.env, this.ctx);
  }

  workspaces() {
    return new Workspaces(this.env, this.ctx);
  }

  fetch(): Response {
    return new Response('OK');
  }
}

// Export as both named and default for service binding compatibility
export { WonderResources };
export default WonderResources;
