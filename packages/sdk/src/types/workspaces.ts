import type { Workspace as DbWorkspace, NewWorkspace } from '@wonder/api/types';

// Re-export canonical types from API
export type Workspace = DbWorkspace;

// Request type for creating workspaces (subset of NewWorkspace)
export interface CreateWorkspaceRequest {
  name: string;
  settings?: unknown;
}
