/**
 * Workflow Run Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../../validators';

export const CreateWorkflowRunSchema = z
  .object({
    input: z.record(z.string(), z.unknown()).openapi({ example: { input: 'value' } }),
  })
  .openapi('CreateWorkflowRun');

export const WorkflowRunCreateResponseSchema = z
  .object({
    workflow_run_id: ulid(),
    project_id: ulid(),
    workspace_id: ulid(),
  })
  .openapi('WorkflowRunCreateResponse');

export const WorkflowRunStartResponseSchema = z
  .object({
    durable_object_id: z.string(),
  })
  .openapi('WorkflowRunStartResponse');
