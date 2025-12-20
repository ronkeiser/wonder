/**
 * Project Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const ProjectSettingsSchema = z.object({
  defaultModelProfileId: z.string().nullable(),
  rateLimitMaxConcurrentRuns: z.number().nullable(),
  rateLimitMaxLlmCallsPerHour: z.number().nullable(),
  budgetMaxMonthlySpendCents: z.number().nullable(),
  budgetAlertThresholdCents: z.number().nullable(),
  snapshotPolicyEveryNEvents: z.number().nullable(),
  snapshotPolicyEveryNSeconds: z.number().nullable(),
  snapshotPolicyOnFanInComplete: z.boolean().nullable(),
});

export const CreateProjectSchema = z
  .object({
    workspaceId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Project' }),
    description: z.string().optional().openapi({ example: 'Project description' }),
    settings: ProjectSettingsSchema.partial().optional().openapi({ example: {} }),
  })
  .openapi('CreateProject');

export const ProjectSchema = z
  .object({
    id: ulid(),
    workspaceId: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    settings: ProjectSettingsSchema.nullable(),
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
