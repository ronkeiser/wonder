/** Workflow Runs RPC resource */

import { NotFoundError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

export class WorkflowRuns extends Resource {
  async get(id: string): Promise<{
    workflow_run: {
      id: string;
      project_id: string;
      workspace_id: string;
      workflow_id: string;
      workflow_def_id: string;
      workflow_version: number;
      status: string;
      context: object;
      active_tokens: object[];
      durable_object_id: string;
      parent_run_id: string | null;
      parent_node_id: string | null;
      latest_snapshot: object | null;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    };
  }> {
    return this.withLogging(
      'get',
      { workflow_run_id: id, metadata: { workflow_run_id: id } },
      async () => {
        const workflowRun = await repo.getWorkflowRunWithProject(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }
        return { workflow_run: workflowRun };
      },
    );
  }

  async complete(id: string, final_output: object): Promise<void> {
    return this.withLogging(
      'complete',
      { trace_id: id, workflow_run_id: id, metadata: { workflow_run_id: id, final_output } },
      async () => {
        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          context: { final_output },
        });

        if (!updated) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { workflow_run_id: id, metadata: { workflow_run_id: id } },
      async () => {
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }

        await repo.deleteWorkflowRun(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
