/**
 * Workflow (Binding) Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateWorkflowSchema = z
  .object({
    projectId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    definitionId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Workflow Instance' }),
    description: z.string().optional().openapi({ example: 'Production workflow instance' }),
  })
  .openapi('CreateWorkflow');

export const WorkflowSchema = z
  .object({
    id: ulid(),
    projectId: ulid(),
    definitionId: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Workflow');

export const WorkflowCreateResponseSchema = z
  .object({
    workflowId: ulid(),
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowCreateResponse');

export const WorkflowGetResponseSchema = z
  .object({
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowGetResponse');
