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
      context: unknown;
      active_tokens: unknown;
      durable_object_id: string;
      parent_run_id: string | null;
      parent_node_id: string | null;
      latest_snapshot: unknown | null;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    };
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_get',
      metadata: { workflow_run_id: id },
    });

    const workflowRun = await repo.getWorkflowRunWithProject(this.serviceCtx.db, id);
    if (!workflowRun) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_run_not_found',
        metadata: { workflow_run_id: id },
      });
      throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
    }

    return { workflow_run: workflowRun };
  }
}
