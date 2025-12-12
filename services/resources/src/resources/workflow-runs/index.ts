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

  async complete(id: string, final_output: object): Promise<void> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_complete',
      trace_id: id,
      metadata: { workflow_run_id: id, final_output },
    });

    const updated = await repo.updateWorkflowRun(this.serviceCtx.db, id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      context: { final_output },
    });

    if (!updated) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_run_complete_failed',
        trace_id: id,
        metadata: { workflow_run_id: id },
      });
      throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
    }

    this.serviceCtx.logger.info({
      event_type: 'workflow_run_completed',
      trace_id: id,
      metadata: { workflow_run_id: id },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_delete_started',
      metadata: { workflow_run_id: id },
    });

    // Verify workflow run exists
    const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
    if (!workflowRun) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_run_not_found',
        metadata: { workflow_run_id: id },
      });
      throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
    }

    await repo.deleteWorkflowRun(this.serviceCtx.db, id);
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_deleted',
      metadata: { workflow_run_id: id },
    });

    return { success: true };
  }
}
