import type { Project as DbProject, NewProject } from '@wonder/api/types';

// Re-export canonical types from API
export type Project = DbProject;

// Request type for creating projects (subset of NewProject)
export interface CreateProjectRequest {
  workspace_id: string;
  name: string;
  description?: string;
  settings?: unknown;
}
