export interface Workspace {
  id: string;
  name: string;
  settings?: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  settings?: unknown;
}
