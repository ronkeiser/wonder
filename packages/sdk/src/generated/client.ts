/**
 * Generated client for Wonder API
 * This file was auto-generated. Do not edit manually.
 */

import type { paths } from './schema.js';

/**
 * Create a typed client for the Wonder API
 * @param baseClient - The underlying HTTP client (from openapi-fetch)
 */
export function createClient(baseClient: any) {
  return {
    workspaces: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/workspaces/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/workspaces/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/workspaces/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/workspaces/${id}`, {});
            return response.data;
          },
          patch: async (body: NonNullable<paths['/api/workspaces/{id}']['patch']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workspaces/{id}']['patch']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.PATCH(`/api/workspaces/${id}`, { body });
            return response.data;
          }
        }),
      {
        list: async (options?: any): Promise<paths['/api/workspaces']['get']['responses']['200']['content']['application/json']> => {
          const response = await baseClient.GET(`/api/workspaces`, {});
          return response.data;
        },
        create: async (body: NonNullable<paths['/api/workspaces']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workspaces']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/workspaces`, { body });
          return response.data;
        }
      }
    ),
    projects: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/projects/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/projects/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/projects/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/projects/${id}`, {});
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/projects']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/projects']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/projects`, { body });
          return response.data;
        }
      }
    ),
    actions: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/actions/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/actions/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/actions/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/actions/${id}`, {});
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/actions']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/actions']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/actions`, { body });
          return response.data;
        }
      }
    ),
    "prompt-specs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/prompt-specs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/prompt-specs/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/prompt-specs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/prompt-specs/${id}`, {});
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/prompt-specs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/prompt-specs']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/prompt-specs`, { body });
          return response.data;
        }
      }
    ),
    "model-profiles": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/model-profiles/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/model-profiles/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/model-profiles/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/model-profiles/${id}`, {});
            return response.data;
          }
        }),
      {
        list: async (options?: any): Promise<paths['/api/model-profiles']['get']['responses']['200']['content']['application/json']> => {
          const response = await baseClient.GET(`/api/model-profiles`, {});
          return response.data;
        },
        create: async (body: NonNullable<paths['/api/model-profiles']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/model-profiles']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/model-profiles`, { body });
          return response.data;
        }
      }
    ),
    "task-defs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/task-defs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/task-defs/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/task-defs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/task-defs/${id}`, {});
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/task-defs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/task-defs']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/task-defs`, { body });
          return response.data;
        },
        list: async (options?: any): Promise<paths['/api/task-defs']['get']['responses']['200']['content']['application/json']> => {
          const response = await baseClient.GET(`/api/task-defs`, {});
          return response.data;
        }
      }
    ),
    "workflow-defs": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/workflow-defs/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/workflow-defs/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/workflow-defs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/workflow-defs/${id}`, {});
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/workflow-defs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workflow-defs']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/workflow-defs`, { body });
          return response.data;
        }
      }
    ),
    workflows: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/api/workflows/{id}']['get']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.GET(`/api/workflows/${id}`, {});
            return response.data;
          },
          delete: async (options?: any): Promise<paths['/api/workflows/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/workflows/${id}`, {});
            return response.data;
          },
          start: async (body: NonNullable<paths['/api/workflows/{id}/start']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workflows/{id}/start']['post']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.POST(`/api/workflows/${id}/start`, { body });
            return response.data;
          },
          create: async (body: NonNullable<paths['/api/workflows/{id}/runs']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workflows/{id}/runs']['post']['responses']['201']['content']['application/json']> => {
            const response = await baseClient.POST(`/api/workflows/${id}/runs`, { body });
            return response.data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/api/workflows']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/api/workflows']['post']['responses']['201']['content']['application/json']> => {
          const response = await baseClient.POST(`/api/workflows`, { body });
          return response.data;
        }
      }
    ),
    "workflow-runs": Object.assign(
      (id: string) => ({
          delete: async (options?: any): Promise<paths['/api/workflow-runs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const response = await baseClient.DELETE(`/api/workflow-runs/${id}`, {});
            return response.data;
          }
        }),
      {
      }
    ),
    events: {
      list: async (options?: any): Promise<paths['/api/events']['get']['responses']['200']['content']['application/json']> => {
        const response = await baseClient.GET(`/api/events`, {});
        return response.data;
      }
    },
    logs: {
      list: async (options?: any): Promise<paths['/api/logs']['get']['responses']['200']['content']['application/json']> => {
        const response = await baseClient.GET(`/api/logs`, {});
        return response.data;
      }
    }
  };
}
