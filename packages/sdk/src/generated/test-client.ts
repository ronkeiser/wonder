/**
 * Generated test client for Wonder API
 * This file was auto-generated. Do not edit manually.
 *
 * Provides:
 * - Auto-unwrapping of API responses
 * - Auto-tracking of created resources
 * - LIFO cleanup with error resilience
 */

import type { paths } from './schema.js';
import { createClient } from './client.js';

/**
 * Deletable resource interface
 */
interface Deletable {
  delete: () => Promise<unknown>;
}

/**
 * Tracks created resources for automatic cleanup
 * 
 * Resources are deleted in LIFO order (reverse of creation) to respect
 * referential integrity constraints.
 */
class ResourceTracker {
  private resources: Deletable[] = [];

  /**
   * Add a resource to the cleanup list
   */
  track(resource: Deletable): void {
    this.resources.push(resource);
  }

  /**
   * Get the number of tracked resources
   */
  get count(): number {
    return this.resources.length;
  }

  /**
   * Delete all tracked resources in reverse order (LIFO)
   * 
   * Continues cleanup even if individual deletions fail.
   * Clears the tracking list after cleanup.
   */
  async cleanup(): Promise<void> {
    if (this.resources.length === 0) {
      return;
    }

    console.log(`✨ Cleaning up ${this.resources.length} resources...`);

    // Delete in reverse order (LIFO)
    const reversed = [...this.resources].reverse();

    for (const resource of reversed) {
      try {
        await resource.delete();
      } catch (error) {
        // Continue cleanup despite errors (resource may already be deleted)
        console.warn('Failed to delete resource:', error);
      }
    }

    this.resources = [];
    console.log('🧹 Cleanup complete!');
  }
}


/**
 * Create a test client for Wonder API
 *
 * The test client automatically unwraps responses and tracks created resources
 * for cleanup. Use this in integration tests instead of the standard client.
 *
 * @param baseClient - The underlying HTTP client (from openapi-fetch)
 */
export function createTestClient(baseClient: any) {
  const standardClient = createClient(baseClient);
  const tracker = new ResourceTracker();

  const client = {
    tracker,

    workspaces: {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/workspaces']['post']['responses']['201']['content']['application/json']['workspace']>> => {
        const response = await standardClient.workspaces.create(body, options);
        const resource = response.workspace;
        
        if (!resource) {
          throw new Error('Failed to create workspace: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient.workspaces(resource.id).delete()
        });
        
        return resource;
      }
    },
    projects: {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/projects']['post']['responses']['201']['content']['application/json']['project']>> => {
        const response = await standardClient.projects.create(body, options);
        const resource = response.project;
        
        if (!resource) {
          throw new Error('Failed to create project: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient.projects(resource.id).delete()
        });
        
        return resource;
      }
    },
    actions: {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/actions']['post']['responses']['201']['content']['application/json']['action']>> => {
        const response = await standardClient.actions.create(body, options);
        const resource = response.action;
        
        if (!resource) {
          throw new Error('Failed to create action: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient.actions(resource.id).delete()
        });
        
        return resource;
      }
    },
    "prompt-specs": {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/prompt-specs']['post']['responses']['201']['content']['application/json']['prompt_spec']>> => {
        const response = await standardClient["prompt-specs"].create(body, options);
        const resource = response.prompt_spec;
        
        if (!resource) {
          throw new Error('Failed to create prompt_spec: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient["prompt-specs"](resource.id).delete()
        });
        
        return resource;
      }
    },
    "model-profiles": {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/model-profiles']['post']['responses']['201']['content']['application/json']['model_profile']>> => {
        const response = await standardClient["model-profiles"].create(body, options);
        const resource = response.model_profile;
        
        if (!resource) {
          throw new Error('Failed to create model_profile: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient["model-profiles"](resource.id).delete()
        });
        
        return resource;
      }
    },
    "task-defs": {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/task-defs']['post']['responses']['201']['content']['application/json']['task_def']>> => {
        const response = await standardClient["task-defs"].create(body, options);
        const resource = response.task_def;
        
        if (!resource) {
          throw new Error('Failed to create task_def: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient["task-defs"](resource.id).delete()
        });
        
        return resource;
      }
    },
    "workflow-defs": {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/workflow-defs']['post']['responses']['201']['content']['application/json']['workflow_def']>> => {
        const response = await standardClient["workflow-defs"].create(body, options);
        const resource = response.workflow_def;
        
        if (!resource) {
          throw new Error('Failed to create workflow_def: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient["workflow-defs"](resource.id).delete()
        });
        
        return resource;
      }
    },
    workflows: {
      create: async (body: any, options?: any): Promise<NonNullable<paths['/api/workflows']['post']['responses']['201']['content']['application/json']['workflow']>> => {
        const response = await standardClient.workflows.create(body, options);
        const resource = response.workflow;
        
        if (!resource) {
          throw new Error('Failed to create workflow: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient.workflows(resource.id).delete()
        });
        
        return resource;
      }
    },
    runs: {
      create: async (id: any, body: any, options?: any): Promise<NonNullable<paths['/api/workflows/{id}/runs']['post']['responses']['201']['content']['application/json']['run']>> => {
        const response = await standardClient.runs.create(id, body, options);
        const resource = response.run;
        
        if (!resource) {
          throw new Error('Failed to create run: resource not in response');
        }
        
        // Track for cleanup
        tracker.track({
          delete: () => standardClient.runs(resource.id).delete()
        });
        
        return resource;
      }
    },

    /**
     * Scaffold a test project with infrastructure and execute a workflow
     * 
     * Creates workspace, project, and model profile, then creates and executes
     * the provided workflow definition. All resources are tracked for cleanup.
     * 
     * @param options.workflowDef - Function that receives modelProfileId and returns workflow definition
     * @param options.input - Input data to pass to the workflow execution
     * @returns Workflow output and infrastructure resources
     */
    scaffold: async (options: {
      workflowDef: (modelProfileId: string) => any;
      input: any;
    }): Promise<{
      output: any;
      runId: string;
      workspace: any;
      project: any;
      modelProfile: any;
    }> => {
      // Create workspace
      const workspaceResponse = await standardClient.workspaces.create({
        name: `Test Workspace ${Date.now()}`,
        settings: {}
      });
      const workspace = workspaceResponse.workspace;
      if (!workspace) throw new Error('Failed to create workspace');
      tracker.track({ delete: () => standardClient.workspaces(workspace.id).delete() });
      
      // Create project
      const projectResponse = await standardClient.projects.create({
        workspace_id: workspace.id,
        name: `Test Project ${Date.now()}`,
        settings: {}
      });
      const project = projectResponse.project;
      if (!project) throw new Error('Failed to create project');
      tracker.track({ delete: () => standardClient.projects(project.id).delete() });
      
      // Create model profile
      const modelProfileResponse = await standardClient["model-profiles"].create({
        name: `Test Model ${Date.now()}`,
        provider: 'cloudflare',
        model_id: '@cf/meta/llama-3.1-8b-instruct',
        parameters: { max_tokens: 512, temperature: 1.0 },
        cost_per_1k_input_tokens: 0.0,
        cost_per_1k_output_tokens: 0.0
      });
      const modelProfile = modelProfileResponse.model_profile;
      if (!modelProfile) throw new Error('Failed to create model profile');
      tracker.track({ delete: () => standardClient["model-profiles"](modelProfile.id).delete() });
      
      // Build workflow definition with model profile ID
      const workflowDef = options.workflowDef(modelProfile.id);
      
      // Inject project ID into workflow definition
      const workflowDefWithProject = {
        ...workflowDef,
        project_id: project.id
      };
      
      // Create workflow definition
      const workflowDefResponse = await standardClient["workflow-defs"].create(workflowDefWithProject);
      const createdWorkflowDef = workflowDefResponse.workflow_def;
      if (!createdWorkflowDef) throw new Error('Failed to create workflow definition');
      tracker.track({ delete: () => standardClient["workflow-defs"](createdWorkflowDef.id).delete() });
      
      // Create and execute workflow
      const workflowResponse = await standardClient.workflows.create({
        workflow_def_id: createdWorkflowDef.id,
        input: options.input
      });
      const workflow = workflowResponse.workflow;
      if (!workflow) throw new Error('Failed to create workflow');
      tracker.track({ delete: () => standardClient.workflows(workflow.id).delete() });
      
      // Poll for completion (simple polling implementation)
      let status = 'running';
      let output: any;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max
      
      while (status === 'running' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusResponse = await standardClient.workflows(workflow.id).get();
        status = statusResponse.status;
        output = statusResponse.output;
        attempts++;
      }
      
      if (status !== 'completed') {
        throw new Error(`Workflow did not complete. Status: ${status}`);
      }
      
      return {
        output,
        runId: workflow.id,
        workspace,
        project,
        modelProfile
      };
    }
  };

  // Add camelCase aliases for kebab-case properties
  return Object.assign(client, {
    promptSpecs: client["prompt-specs"],
    modelProfiles: client["model-profiles"],
    taskDefs: client["task-defs"],
    workflowDefs: client["workflow-defs"]
  });
}
