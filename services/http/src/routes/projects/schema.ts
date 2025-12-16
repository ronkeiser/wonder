/**
 * Project Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateProjectSchema = z
  .object({
    workspace_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Project' }),
    description: z.string().optional().openapi({ example: 'Project description' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('CreateProject');

export const ProjectSchema = z
  .object({
    id: ulid(),
    workspace_id: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Project');

export const ProjectCreateResponseSchema = z
  .object({
    project_id: ulid(),
    project: ProjectSchema,
  })
  .openapi('ProjectCreateResponse');

export const ProjectGetResponseSchema = z
  .object({
    project: ProjectSchema,
  })
  .openapi('ProjectGetResponse');
