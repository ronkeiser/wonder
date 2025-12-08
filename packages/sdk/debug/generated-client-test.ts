/**
 * Generated client for Wonder API
 * This file was auto-generated. Do not edit manually.
 */

import type { paths } from './schema.js';
import type { SchemaType } from '@wonder/context';

/**
 * Create a typed client for the Wonder API
 * @param baseClient - The underlying HTTP client (from openapi-fetch)
 */
export function createClient(baseClient: any) {
  return {
    workspaces: Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/workspaces/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/workspaces/${id}`, {});
      return response.data;
    },
    patch: async (id: string, body: any, options?: any) => {
      const response = await baseClient.PATCH(`/api/workspaces/${id}`, { body });
      return response.data;
    }
  })
      ,
      {
        list: async (options?: any) => {
          const response = await baseClient.GET(`/api/workspaces`, {});
          return response.data;
        },
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/workspaces`, { body });
          return response.data;
        }
      }
    ),
    projects: Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/projects/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/projects/${id}`, {});
      return response.data;
    }
  })
      ,
      {
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/projects`, { body });
          return response.data;
        }
      }
    ),
    actions: Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/actions/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/actions/${id}`, {});
      return response.data;
    }
  })
      ,
      {
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/actions`, { body });
          return response.data;
        }
      }
    ),
    "prompt-specs": Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/prompt-specs/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/prompt-specs/${id}`, {});
      return response.data;
    }
  })
      ,
      {
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/prompt-specs`, { body });
          return response.data;
        }
      }
    ),
    "model-profiles": Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/model-profiles/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/model-profiles/${id}`, {});
      return response.data;
    }
  })
      ,
      {
        list: async (options?: any) => {
          const response = await baseClient.GET(`/api/model-profiles`, {});
          return response.data;
        },
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/model-profiles`, { body });
          return response.data;
        }
      }
    ),
    "workflow-defs": Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/workflow-defs/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/workflow-defs/${id}`, {});
      return response.data;
    }
  })
      ,
      {
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/workflow-defs`, { body });
          return response.data;
        }
      }
    ),
    workflows: Object.assign(
      (id: string) => ({
    get: async (id: string, options?: any) => {
      const response = await baseClient.GET(`/api/workflows/${id}`, {});
      return response.data;
    },
    delete: async (id: string, options?: any) => {
      const response = await baseClient.DELETE(`/api/workflows/${id}`, {});
      return response.data;
    },
    start: async (id: string, body: any, options?: any) => {
      const response = await baseClient.POST(`/api/workflows/${id}/start`, { body });
      return response.data;
    }
  })
      ,
      {
        create: async (body: any, options?: any) => {
          const response = await baseClient.POST(`/api/workflows`, { body });
          return response.data;
        }
      }
    ),
    logs: {
      list: async (options?: any) => {
        const response = await baseClient.GET(`/api/logs`, {});
        return response.data;
      }
    }
  };
}
