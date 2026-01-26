import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

const AgentConstraintsSchema = z.object({
  maxMovesPerTurn: z.number().int().positive().optional(),
});

export const CreatePersonaSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Code Reviewer' }),
    reference: z.string().optional().openapi({
      example: 'core/code-reviewer',
      description: 'Stable identity for autoversion scoping. Required when autoversion=true.',
    }),
    description: z.string().default('').openapi({ example: 'Reviews code for best practices' }),
    libraryId: z.string().optional().openapi({ example: 'lib_123' }),
    systemPrompt: z.string().min(1).openapi({ example: 'You are a helpful code reviewer.' }),
    modelProfileRef: z.string().min(1).openapi({ example: 'claude-3-5-sonnet' }),
    modelProfileVersion: z.number().int().nullable().optional().openapi({ example: 1 }),
    contextAssemblyWorkflowRef: z.string().min(1).openapi({ example: 'core/context-assembly' }),
    contextAssemblyWorkflowVersion: z.number().int().nullable().optional().openapi({ example: 1 }),
    memoryExtractionWorkflowRef: z.string().min(1).openapi({ example: 'core/memory-extraction' }),
    memoryExtractionWorkflowVersion: z.number().int().nullable().optional().openapi({ example: 1 }),
    recentTurnsLimit: z.number().int().positive().default(20).openapi({ example: 20 }),
    toolIds: z.array(z.string()).openapi({ example: ['tool_1', 'tool_2'] }),
    constraints: AgentConstraintsSchema.optional(),
    autoversion: z
      .boolean()
      .optional()
      .openapi({
        description:
          'When true, compute content hash for deduplication. If existing persona with same reference and content exists, return it. Otherwise auto-increment version.',
      }),
    force: z.boolean().optional().openapi({
      description: 'Skip content hash deduplication and always create a new version.',
    }),
  })
  .openapi('CreatePersona');

export const PersonaSchema = z
  .object({
    id: z.string().openapi({ example: 'code-reviewer' }),
    version: z.number().int(),
    name: z.string(),
    reference: z.string().openapi({ description: 'Stable identity for autoversion scoping' }),
    description: z.string(),
    libraryId: z.string().nullable(),
    systemPrompt: z.string(),
    modelProfileRef: z.string(),
    modelProfileVersion: z.number().int().nullable(),
    contextAssemblyWorkflowRef: z.string(),
    contextAssemblyWorkflowVersion: z.number().int().nullable(),
    memoryExtractionWorkflowRef: z.string(),
    memoryExtractionWorkflowVersion: z.number().int().nullable(),
    recentTurnsLimit: z.number().int(),
    toolIds: z.array(z.string()),
    constraints: AgentConstraintsSchema.nullable(),
    contentHash: z.string(),
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
    version: z.number().openapi({ description: 'Version number of the created/reused persona' }),
    latestVersion: z.number().optional().openapi({
      description: 'Latest version for this name (only present when reused=true)',
    }),
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
