/** Projects RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

export class Projects extends Resource {
  async create(data: {
    workspace_id: string;
    name: string;
    description?: string;
    settings?: {
      default_model_profile_id?: string;
      rate_limit_max_concurrent_runs?: number;
      rate_limit_max_llm_calls_per_hour?: number;
      budget_max_monthly_spend_cents?: number;
      budget_alert_threshold_cents?: number;
      snapshot_policy_every_n_events?: number;
      snapshot_policy_every_n_seconds?: number;
      snapshot_policy_on_fan_in_complete?: boolean;
    };
  }): Promise<{
    project_id: string;
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: {
        default_model_profile_id?: string;
        rate_limit_max_concurrent_runs?: number;
        rate_limit_max_llm_calls_per_hour?: number;
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
        snapshot_policy_every_n_events?: number;
        snapshot_policy_every_n_seconds?: number;
        snapshot_policy_on_fan_in_complete?: boolean;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'create',
      {
        workspace_id: data.workspace_id,
        metadata: { workspace_id: data.workspace_id, name: data.name },
      },
      async () => {
        try {
          const project = await repo.createProject(this.serviceCtx.db, {
            workspace_id: data.workspace_id,
            name: data.name,
            description: data.description ?? null,
            settings: data.settings ?? null,
          });

          return {
            project_id: project.id,
            project,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `Project with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          if (dbError.constraint === 'foreign_key') {
            throw new NotFoundError(
              `Workspace not found: ${data.workspace_id}`,
              'workspace',
              data.workspace_id,
            );
          }

          throw error;
        }
      },
    );
  }

  async get(id: string): Promise<{
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: {
        default_model_profile_id?: string;
        rate_limit_max_concurrent_runs?: number;
        rate_limit_max_llm_calls_per_hour?: number;
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
        snapshot_policy_every_n_events?: number;
        snapshot_policy_every_n_seconds?: number;
        snapshot_policy_on_fan_in_complete?: boolean;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging('get', { project_id: id, metadata: { project_id: id } }, async () => {
      const project = await repo.getProject(this.serviceCtx.db, id);
      if (!project) {
        throw new NotFoundError(`Project not found: ${id}`, 'project', id);
      }
      return { project };
    });
  }

  async list(params?: { workspace_id?: string; limit?: number }): Promise<{
    projects: Array<{
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: {
        default_model_profile_id?: string;
        rate_limit_max_concurrent_runs?: number;
        rate_limit_max_llm_calls_per_hour?: number;
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
        snapshot_policy_every_n_events?: number;
        snapshot_policy_every_n_seconds?: number;
        snapshot_policy_on_fan_in_complete?: boolean;
      } | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const projects = await repo.listProjects(
        this.serviceCtx.db,
        params?.workspace_id,
        params?.limit,
      );
      return { projects };
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      settings?: {
        default_model_profile_id?: string;
        rate_limit_max_concurrent_runs?: number;
        rate_limit_max_llm_calls_per_hour?: number;
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
        snapshot_policy_every_n_events?: number;
        snapshot_policy_every_n_seconds?: number;
        snapshot_policy_on_fan_in_complete?: boolean;
      };
    },
  ): Promise<{
    project: {
      id: string;
      workspace_id: string;
      name: string;
      description: string | null;
      settings: {
        default_model_profile_id?: string;
        rate_limit_max_concurrent_runs?: number;
        rate_limit_max_llm_calls_per_hour?: number;
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
        snapshot_policy_every_n_events?: number;
        snapshot_policy_every_n_seconds?: number;
        snapshot_policy_on_fan_in_complete?: boolean;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'update',
      { project_id: id, metadata: { project_id: id } },
      async () => {
        const project = await repo.updateProject(this.serviceCtx.db, id, data);
        if (!project) {
          throw new NotFoundError(`Project not found: ${id}`, 'project', id);
        }
        return { project };
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { project_id: id, metadata: { project_id: id } },
      async () => {
        const project = await repo.getProject(this.serviceCtx.db, id);
        if (!project) {
          throw new NotFoundError(`Project not found: ${id}`, 'project', id);
        }

        await repo.deleteProject(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
