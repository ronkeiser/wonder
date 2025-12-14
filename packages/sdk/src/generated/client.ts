/**
 * Generated client for Wonder API
 * This file was auto-generated. Do not edit manually.
 */

import type { paths } from './schema.js';

/**
 * Error thrown when an API request fails
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    const detailsStr = typeof details === "object" ? JSON.stringify(details, null, 2) : String(details);
    super(`${message}\n${detailsStr}`);
    this.name = "ApiError";
  }
}

/**
 * Create a typed client for the Wonder API
 * @param baseClient - The underlying HTTP client (from openapi-fetch)
 */
export function createClient(baseClient: any) {
  const client = {
    workspaces: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/workspaces/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/workspaces/${id}`, {});
            if (error) throw new ApiError(`GET /api/workspaces/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workspaces/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/workspaces/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/workspaces/${id} failed`, error);
            return data;
          },
          patch: async (body: NonNullable<paths['/workspaces/{id}']['patch']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workspaces/{id}']['patch']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.PATCH(`/api/workspaces/${id}`, { body });
            if (error) throw new ApiError(`PATCH /api/workspaces/${id} failed`, error);
            return data;
          }
        }),
      {
        list: async (options?: any): Promise<paths['/workspaces']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/api/workspaces`, {});
          if (error) throw new ApiError(`GET /api/workspaces failed`, error);
          return data;
        },
        create: async (body: NonNullable<paths['/workspaces']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workspaces']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/workspaces`, { body });
          if (error) throw new ApiError(`POST /api/workspaces failed`, error);
          return data;
        }
      }
    ),
    projects: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/projects/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/projects/${id}`, {});
            if (error) throw new ApiError(`GET /api/projects/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/projects/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/projects/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/projects/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/projects']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/projects']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/projects`, { body });
          if (error) throw new ApiError(`POST /api/projects failed`, error);
          return data;
        }
      }
    ),
    actions: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/actions/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/actions/${id}`, {});
            if (error) throw new ApiError(`GET /api/actions/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/actions/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/actions/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/actions/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/actions']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/actions']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/actions`, { body });
          if (error) throw new ApiError(`POST /api/actions failed`, error);
          return data;
        }
      }
    ),
    "prompt-specs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/prompt-specs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/prompt-specs/${id}`, {});
            if (error) throw new ApiError(`GET /api/prompt-specs/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/prompt-specs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/prompt-specs/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/prompt-specs/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/prompt-specs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/prompt-specs']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/prompt-specs`, { body });
          if (error) throw new ApiError(`POST /api/prompt-specs failed`, error);
          return data;
        }
      }
    ),
    "model-profiles": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/model-profiles/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/model-profiles/${id}`, {});
            if (error) throw new ApiError(`GET /api/model-profiles/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/model-profiles/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/model-profiles/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/model-profiles/${id} failed`, error);
            return data;
          }
        }),
      {
        list: async (options?: any): Promise<paths['/model-profiles']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/api/model-profiles`, {});
          if (error) throw new ApiError(`GET /api/model-profiles failed`, error);
          return data;
        },
        create: async (body: NonNullable<paths['/model-profiles']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/model-profiles']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/model-profiles`, { body });
          if (error) throw new ApiError(`POST /api/model-profiles failed`, error);
          return data;
        }
      }
    ),
    "task-defs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/task-defs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/task-defs/${id}`, {});
            if (error) throw new ApiError(`GET /api/task-defs/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/task-defs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/task-defs/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/task-defs/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/task-defs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/task-defs']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/task-defs`, { body });
          if (error) throw new ApiError(`POST /api/task-defs failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/task-defs']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/api/task-defs`, {});
          if (error) throw new ApiError(`GET /api/task-defs failed`, error);
          return data;
        }
      }
    ),
    "workflow-defs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/workflow-defs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/workflow-defs/${id}`, {});
            if (error) throw new ApiError(`GET /api/workflow-defs/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workflow-defs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/workflow-defs/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/workflow-defs/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/workflow-defs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflow-defs']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/workflow-defs`, { body });
          if (error) throw new ApiError(`POST /api/workflow-defs failed`, error);
          return data;
        }
      }
    ),
    workflows: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/workflows/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/api/workflows/${id}`, {});
            if (error) throw new ApiError(`GET /api/workflows/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workflows/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/workflows/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/workflows/${id} failed`, error);
            return data;
          },
          start: async (body: NonNullable<paths['/workflows/{id}/start']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows/{id}/start']['post']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.POST(`/api/workflows/${id}/start`, { body });
            if (error) throw new ApiError(`POST /api/workflows/${id}/start failed`, error);
            return data;
          },
          create: async (body: NonNullable<paths['/workflows/{id}/runs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows/{id}/runs']['post']['responses']['201']['content']['application/json']> => {
            const { data, error } = await baseClient.POST(`/api/workflows/${id}/runs`, { body });
            if (error) throw new ApiError(`POST /api/workflows/${id}/runs failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/workflows']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/api/workflows`, { body });
          if (error) throw new ApiError(`POST /api/workflows failed`, error);
          return data;
        }
      }
    ),
    "workflow-runs": Object.assign(
      (id: string) => ({
          delete: async (options?: any): Promise<paths['/workflow-runs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/api/workflow-runs/${id}`, {});
            if (error) throw new ApiError(`DELETE /api/workflow-runs/${id} failed`, error);
            return data;
          }
        }),
      {
      }
    ),
    events: {
      list: async (options?: any): Promise<paths['/events']['get']['responses']['200']['content']['application/json']> => {
        const { data, error } = await baseClient.GET(`/api/events`, {});
        if (error) throw new ApiError(`GET /api/events failed`, error);
        return data;
      }
    },
    logs: {
      list: async (options?: any): Promise<paths['/logs']['get']['responses']['200']['content']['application/json']> => {
        const { data, error } = await baseClient.GET(`/api/logs`, {});
        if (error) throw new ApiError(`GET /api/logs failed`, error);
        return data;
      }
    }
  };

  // Add camelCase aliases for kebab-case properties
  return Object.assign(client, {
    promptSpecs: client["prompt-specs"],
    modelProfiles: client["model-profiles"],
    taskDefs: client["task-defs"],
    workflowDefs: client["workflow-defs"],
    workflowRuns: client["workflow-runs"]
  });
}
