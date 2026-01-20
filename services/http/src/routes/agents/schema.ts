import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateAgentSchema = z
  .object({
    name: z.string().min(1).openapi({ example: 'Jimmy' }),
    projectIds: z.array(z.string()).min(1).openapi({ example: ['proj_123'] }),
    personaId: z.string().optional().openapi({ example: 'persona_abc' }),
    personaVersion: z.number().int().positive().optional().openapi({ example: 1 }),
  })
  .openapi('CreateAgent');

export const AgentSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string(),
    projectIds: z.array(z.string()),
    personaId: z.string().nullable(),
    personaVersion: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Agent');

export const AgentCreateResponseSchema = z
  .object({
    agentId: z.string(),
    agent: AgentSchema,
  })
  .openapi('AgentCreateResponse');

export const AgentGetResponseSchema = z
  .object({
    agent: AgentSchema,
  })
  .openapi('AgentGetResponse');

export const AgentListResponseSchema = z
  .object({
    agents: z.array(AgentSchema),
  })
  .openapi('AgentListResponse');
