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
            const { data, error } = await baseClient.GET(`/workspaces/${id}`, {});
            if (error) throw new ApiError(`GET /workspaces/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workspaces/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/workspaces/${id}`, {});
            if (error) throw new ApiError(`DELETE /workspaces/${id} failed`, error);
            return data;
          },
          patch: async (body: NonNullable<paths['/workspaces/{id}']['patch']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workspaces/{id}']['patch']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.PATCH(`/workspaces/${id}`, { body });
            if (error) throw new ApiError(`PATCH /workspaces/${id} failed`, error);
            return data;
          },
          projects: {
            list: async (options?: any): Promise<paths['/workspaces/{id}/projects']['get']['responses']['200']['content']['application/json']> => {
              const { data, error } = await baseClient.GET(`/workspaces/${id}/projects`, {});
              if (error) throw new ApiError(`GET /workspaces/${id}/projects failed`, error);
              return data;
            }
          }
        }),
      {
        list: async (options?: any): Promise<paths['/workspaces']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/workspaces`, {});
          if (error) throw new ApiError(`GET /workspaces failed`, error);
          return data;
        },
        create: async (body: NonNullable<paths['/workspaces']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workspaces']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/workspaces`, { body });
          if (error) throw new ApiError(`POST /workspaces failed`, error);
          return data;
        }
      }
    ),
    projects: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/projects/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/projects/${id}`, {});
            if (error) throw new ApiError(`GET /projects/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/projects/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/projects/${id}`, {});
            if (error) throw new ApiError(`DELETE /projects/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/projects']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/projects']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/projects`, { body });
          if (error) throw new ApiError(`POST /projects failed`, error);
          return data;
        }
      }
    ),
    actions: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/actions/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/actions/${id}`, {});
            if (error) throw new ApiError(`GET /actions/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/actions/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/actions/${id}`, {});
            if (error) throw new ApiError(`DELETE /actions/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/actions']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/actions']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/actions`, { body });
          if (error) throw new ApiError(`POST /actions failed`, error);
          return data;
        }
      }
    ),
    "prompt-specs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/prompt-specs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/prompt-specs/${id}`, {});
            if (error) throw new ApiError(`GET /prompt-specs/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/prompt-specs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/prompt-specs/${id}`, {});
            if (error) throw new ApiError(`DELETE /prompt-specs/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/prompt-specs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/prompt-specs']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/prompt-specs`, { body });
          if (error) throw new ApiError(`POST /prompt-specs failed`, error);
          return data;
        }
      }
    ),
    "model-profiles": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/model-profiles/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/model-profiles/${id}`, {});
            if (error) throw new ApiError(`GET /model-profiles/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/model-profiles/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/model-profiles/${id}`, {});
            if (error) throw new ApiError(`DELETE /model-profiles/${id} failed`, error);
            return data;
          }
        }),
      {
        list: async (options?: any): Promise<paths['/model-profiles']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/model-profiles`, {});
          if (error) throw new ApiError(`GET /model-profiles failed`, error);
          return data;
        },
        create: async (body: NonNullable<paths['/model-profiles']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/model-profiles']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/model-profiles`, { body });
          if (error) throw new ApiError(`POST /model-profiles failed`, error);
          return data;
        }
      }
    ),
    tasks: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/tasks/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/tasks/${id}`, {});
            if (error) throw new ApiError(`GET /tasks/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/tasks/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/tasks/${id}`, {});
            if (error) throw new ApiError(`DELETE /tasks/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/tasks']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/tasks']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/tasks`, { body });
          if (error) throw new ApiError(`POST /tasks failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/tasks']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/tasks`, {});
          if (error) throw new ApiError(`GET /tasks failed`, error);
          return data;
        }
      }
    ),
    "workflow-defs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/workflow-defs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/workflow-defs/${id}`, {});
            if (error) throw new ApiError(`GET /workflow-defs/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workflow-defs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/workflow-defs/${id}`, {});
            if (error) throw new ApiError(`DELETE /workflow-defs/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/workflow-defs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflow-defs']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/workflow-defs`, { body });
          if (error) throw new ApiError(`POST /workflow-defs failed`, error);
          return data;
        }
      }
    ),
    workflows: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/workflows/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/workflows/${id}`, {});
            if (error) throw new ApiError(`GET /workflows/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/workflows/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/workflows/${id}`, {});
            if (error) throw new ApiError(`DELETE /workflows/${id} failed`, error);
            return data;
          },
          start: async (body: NonNullable<paths['/workflows/{id}/start']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows/{id}/start']['post']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.POST(`/workflows/${id}/start`, { body });
            if (error) throw new ApiError(`POST /workflows/${id}/start failed`, error);
            return data;
          },
          create: async (body: NonNullable<paths['/workflows/{id}/runs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows/{id}/runs']['post']['responses']['201']['content']['application/json']> => {
            const { data, error } = await baseClient.POST(`/workflows/${id}/runs`, { body });
            if (error) throw new ApiError(`POST /workflows/${id}/runs failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/workflows']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflows']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/workflows`, { body });
          if (error) throw new ApiError(`POST /workflows failed`, error);
          return data;
        }
      }
    ),
    "workflow-runs": Object.assign(
      (id: string) => ({
          delete: async (options?: any): Promise<paths['/workflow-runs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/workflow-runs/${id}`, {});
            if (error) throw new ApiError(`DELETE /workflow-runs/${id} failed`, error);
            return data;
          },
          stream: {
          }
        }),
      {
        list: async (options?: any): Promise<paths['/workflow-runs']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/workflow-runs`, {});
          if (error) throw new ApiError(`GET /workflow-runs failed`, error);
          return data;
        }
      }
    ),
    events: {
      list: async (options?: any): Promise<paths['/events']['get']['responses']['200']['content']['application/json']> => {
        const { data, error } = await baseClient.GET(`/events`, {});
        if (error) throw new ApiError(`GET /events failed`, error);
        return data;
      }
    },
    logs: {
      list: async (options?: any): Promise<paths['/logs']['get']['responses']['200']['content']['application/json']> => {
        const { data, error } = await baseClient.GET(`/logs`, {});
        if (error) throw new ApiError(`GET /logs failed`, error);
        return data;
      }
    }
  };

  // Add camelCase aliases for kebab-case properties
  return Object.assign(client, {
    promptSpecs: client["prompt-specs"],
    modelProfiles: client["model-profiles"],
    workflowDefs: client["workflow-defs"],
    workflowRuns: client["workflow-runs"]
  });
}
