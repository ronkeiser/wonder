export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  settings: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  workspace_id: string;
  name: string;
  description?: string;
  settings?: unknown;
}
