/**
 * Workspace Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import { ProjectSchema } from '../projects/schema';

export const CreateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('CreateWorkspace');

export const WorkspaceSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string().openapi({ example: '2024-01-01T00:00:00Z' }),
    updated_at: z.string().openapi({ example: '2024-01-01T00:00:00Z' }),
  })
  .openapi('Workspace');

export const WorkspaceCreateResponseSchema = z
  .object({
    workspace_id: ulid(),
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceCreateResponse');

export const WorkspaceGetResponseSchema = z
  .object({
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceGetResponse');

export const WorkspaceListResponseSchema = z
  .object({
    workspaces: z.array(WorkspaceSchema),
  })
  .openapi('WorkspaceListResponse');

export const UpdateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(255).optional().openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('UpdateWorkspace');

export const WorkspaceUpdateResponseSchema = z
  .object({
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceUpdateResponse');

export const WorkspaceProjectsResponseSchema = z
  .object({
    projects: z.array(ProjectSchema),
  })
  .openapi('WorkspaceProjectsResponse');
