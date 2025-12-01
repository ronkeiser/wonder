import createClient from 'openapi-fetch';
import type { paths } from '../generated/schema';

type BaseClient = ReturnType<typeof createClient<paths>>;

export class WorkspaceResource {
  constructor(private baseClient: BaseClient, private id: string) {}

  async get() {
    return this.baseClient.GET('/api/workspaces/{id}', {
      params: { path: { id: this.id } },
    });
  }

  async update(
    body: NonNullable<
      paths['/api/workspaces/{id}']['patch']['requestBody']
    >['content']['application/json'],
  ) {
    return this.baseClient.PATCH('/api/workspaces/{id}', {
      params: { path: { id: this.id } },
      body,
    });
  }

  async delete() {
    return this.baseClient.DELETE('/api/workspaces/{id}', {
      params: { path: { id: this.id } },
    });
  }
}

export function createWorkspacesCollection(baseClient: BaseClient) {
  return Object.assign(
    // Call with ID returns a WorkspaceResource
    (id: string) => new WorkspaceResource(baseClient, id),
    {
      // Collection methods
      create: (
        body: NonNullable<
          paths['/api/workspaces']['post']['requestBody']
        >['content']['application/json'],
      ) => baseClient.POST('/api/workspaces', { body }),
      list: (query?: NonNullable<paths['/api/workspaces']['get']['parameters']['query']>) =>
        baseClient.GET('/api/workspaces', { params: { query } }),
    },
  );
}
