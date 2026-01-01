/**
 * Generated client for Wonder API
 * This file was auto-generated. Do not edit manually.
 */

import type { paths } from './schema.js';

/**
 * Parse SSE stream into async generator of events
 */
async function* parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (end with \n\n)
      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";

      for (const message of messages) {
        if (!message.trim()) continue;

        // Parse SSE format: "data: {...}"
        for (const line of message.split("\n")) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              yield JSON.parse(jsonStr) as T;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
    agents: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/agents/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/agents/${id}`, {});
            if (error) throw new ApiError(`GET /agents/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/agents/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/agents/${id}`, {});
            if (error) throw new ApiError(`DELETE /agents/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/agents']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/agents']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/agents`, { body });
          if (error) throw new ApiError(`POST /agents failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/agents']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/agents`, {});
          if (error) throw new ApiError(`GET /agents failed`, error);
          return data;
        }
      }
    ),
    "artifact-types": Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/artifact-types/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/artifact-types/${id}`, {});
            if (error) throw new ApiError(`GET /artifact-types/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/artifact-types/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/artifact-types/${id}`, {});
            if (error) throw new ApiError(`DELETE /artifact-types/${id} failed`, error);
            return data;
          },
          versions: {
          }
        }),
      {
        create: async (body: NonNullable<paths['/artifact-types']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/artifact-types']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/artifact-types`, { body });
          if (error) throw new ApiError(`POST /artifact-types failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/artifact-types']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/artifact-types`, {});
          if (error) throw new ApiError(`GET /artifact-types failed`, error);
          return data;
        }
      }
    ),
    conversations: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/conversations/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/conversations/${id}`, {});
            if (error) throw new ApiError(`GET /conversations/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/conversations/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/conversations/${id}`, {});
            if (error) throw new ApiError(`DELETE /conversations/${id} failed`, error);
            return data;
          },
          status: {
            patch: async (body: NonNullable<paths['/conversations/{id}/status']['patch']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/conversations/{id}/status']['patch']['responses']['200']['content']['application/json']> => {
              const { data, error } = await baseClient.PATCH(`/conversations/${id}/status`, { body });
              if (error) throw new ApiError(`PATCH /conversations/${id}/status failed`, error);
              return data;
            }
          }
        }),
      {
        create: async (body: NonNullable<paths['/conversations']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/conversations']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/conversations`, { body });
          if (error) throw new ApiError(`POST /conversations failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/conversations']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/conversations`, {});
          if (error) throw new ApiError(`GET /conversations failed`, error);
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
    },
    messages: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/messages/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/messages/${id}`, {});
            if (error) throw new ApiError(`GET /messages/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/messages/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/messages/${id}`, {});
            if (error) throw new ApiError(`DELETE /messages/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/messages']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/messages']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/messages`, { body });
          if (error) throw new ApiError(`POST /messages failed`, error);
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
    personas: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/personas/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/personas/${id}`, {});
            if (error) throw new ApiError(`GET /personas/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/personas/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/personas/${id}`, {});
            if (error) throw new ApiError(`DELETE /personas/${id} failed`, error);
            return data;
          },
          versions: {
          }
        }),
      {
        create: async (body: NonNullable<paths['/personas']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/personas']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/personas`, { body });
          if (error) throw new ApiError(`POST /personas failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/personas']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/personas`, {});
          if (error) throw new ApiError(`GET /personas failed`, error);
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
    tools: Object.assign(
      (id: string) => ({
          get: async (options?: any): Promise<paths['/tools/{id}']['get']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.GET(`/tools/${id}`, {});
            if (error) throw new ApiError(`GET /tools/${id} failed`, error);
            return data;
          },
          delete: async (options?: any): Promise<paths['/tools/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/tools/${id}`, {});
            if (error) throw new ApiError(`DELETE /tools/${id} failed`, error);
            return data;
          }
        }),
      {
        create: async (body: NonNullable<paths['/tools']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/tools']['post']['responses']['201']['content']['application/json']> => {
          const { data, error } = await baseClient.POST(`/tools`, { body });
          if (error) throw new ApiError(`POST /tools failed`, error);
          return data;
        },
        list: async (options?: any): Promise<paths['/tools']['get']['responses']['200']['content']['application/json']> => {
          const { data, error } = await baseClient.GET(`/tools`, {});
          if (error) throw new ApiError(`GET /tools failed`, error);
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
    "workflow-runs": Object.assign(
      (id: string) => ({
          delete: async (options?: any): Promise<paths['/workflow-runs/{id}']['delete']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.DELETE(`/workflow-runs/${id}`, {});
            if (error) throw new ApiError(`DELETE /workflow-runs/${id} failed`, error);
            return data;
          },
          cancel: async (body: NonNullable<paths['/workflow-runs/{id}/cancel']['post']['requestBody']>['content']['application/json'], options?: any): Promise<paths['/workflow-runs/{id}/cancel']['post']['responses']['200']['content']['application/json']> => {
            const { data, error } = await baseClient.POST(`/workflow-runs/${id}/cancel`, { body });
            if (error) throw new ApiError(`POST /workflow-runs/${id}/cancel failed`, error);
            return data;
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
          start: async function* (body: NonNullable<paths['/workflows/{id}/start']['post']['requestBody']>['content']['application/json'], options?: any): AsyncGenerator<paths['/workflows/{id}/start']['post']['responses']['200']['content']['text/event-stream']> {
            const response = await baseClient.POST(`/workflows/${id}/start`, { body });
            if (!response.response.ok) {
              throw new ApiError(`POST /workflows/${id}/start failed`, response.error);
            }
            if (!response.response.body) {
              throw new ApiError(`POST /workflows/${id}/start returned no body`, null);
            }
            yield* parseSSEStream<paths['/workflows/{id}/start']['post']['responses']['200']['content']['text/event-stream']>(response.response.body);
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
    )
  };

  // Add camelCase aliases for kebab-case properties
  return Object.assign(client, {
    artifactTypes: client["artifact-types"],
    modelProfiles: client["model-profiles"],
    promptSpecs: client["prompt-specs"],
    workflowDefs: client["workflow-defs"],
    workflowRuns: client["workflow-runs"]
  });
}
