import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

const AgentConstraintsSchema = z.object({
  maxMovesPerTurn: z.number().int().positive().optional(),
});

export const CreatePersonaSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Code Reviewer' }),
    description: z.string().default('').openapi({ example: 'Reviews code for best practices' }),
    libraryId: z.string().optional().openapi({ example: 'lib_123' }),
    systemPrompt: z.string().min(1).openapi({ example: 'You are a helpful code reviewer.' }),
    modelProfileId: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    contextAssemblyWorkflowId: z.string().min(1).openapi({ example: 'wf_context' }),
    memoryExtractionWorkflowId: z.string().min(1).openapi({ example: 'wf_memory' }),
    recentTurnsLimit: z.number().int().positive().default(20).openapi({ example: 20 }),
    toolIds: z.array(z.string()).openapi({ example: ['tool_1', 'tool_2'] }),
    constraints: AgentConstraintsSchema.optional(),
    autoversion: z
      .boolean()
      .optional()
      .openapi({
        description:
          'When true, compute content hash for deduplication. If existing persona with same name and content exists, return it. Otherwise auto-increment version.',
      }),
  })
  .openapi('CreatePersona');

export const PersonaSchema = z
  .object({
    id: z.string().openapi({ example: 'code-reviewer' }),
    version: z.number().int(),
    name: z.string(),
    description: z.string(),
    libraryId: z.string().nullable(),
    systemPrompt: z.string(),
    modelProfileId: z.string(),
    contextAssemblyWorkflowId: z.string(),
    memoryExtractionWorkflowId: z.string(),
    recentTurnsLimit: z.number().int(),
    toolIds: z.array(z.string()),
    constraints: AgentConstraintsSchema.nullable(),
    contentHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Persona');

export const PersonaCreateResponseSchema = z
  .object({
    personaId: z.string(),
    persona: PersonaSchema,
    reused: z
      .boolean()
      .openapi({ description: 'True if an existing persona was reused (autoversion matched)' }),
  })
  .openapi('PersonaCreateResponse');

export const PersonaGetResponseSchema = z
  .object({
    persona: PersonaSchema,
  })
  .openapi('PersonaGetResponse');

export const PersonaListResponseSchema = z
  .object({
    personas: z.array(PersonaSchema),
  })
  .openapi('PersonaListResponse');
