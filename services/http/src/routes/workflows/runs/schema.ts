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
    workflowRunId: ulid(),
    projectId: ulid(),
    workspaceId: ulid(),
  })
  .openapi('WorkflowRunCreateResponse');

export const StartWorkflowRunSchema = z
  .object({
    enableTraceEvents: z.boolean().optional().openapi({
      description: 'Enable trace event emission for this workflow run',
      example: true,
    }),
  })
  .openapi('StartWorkflowRun');

export const WorkflowRunStartResponseSchema = z
  .object({
    durableObjectId: z.string(),
  })
  .openapi('WorkflowRunStartResponse');
