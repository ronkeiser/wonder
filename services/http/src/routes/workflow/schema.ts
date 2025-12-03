/**
 * Workflow (Binding) Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateWorkflowSchema = z
  .object({
    project_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    workflow_def_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Workflow Instance' }),
    description: z.string().optional().openapi({ example: 'Production workflow instance' }),
  })
  .openapi('CreateWorkflow');

export const WorkflowSchema = z
  .object({
    id: ulid(),
    project_id: ulid(),
    workflow_def_id: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Workflow');

export const WorkflowCreateResponseSchema = z
  .object({
    workflow_id: ulid(),
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowCreateResponse');

export const WorkflowGetResponseSchema = z
  .object({
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowGetResponse');
