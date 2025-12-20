/**
 * Project Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateProjectSchema = z
  .object({
    workspaceId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Project' }),
    description: z.string().optional().openapi({ example: 'Project description' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('CreateProject');

export const ProjectSchema = z
  .object({
    id: ulid(),
    workspaceId: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Project');

export const ProjectCreateResponseSchema = z
  .object({
    projectId: ulid(),
    project: ProjectSchema,
  })
  .openapi('ProjectCreateResponse');

export const ProjectGetResponseSchema = z
  .object({
    project: ProjectSchema,
  })
  .openapi('ProjectGetResponse');
