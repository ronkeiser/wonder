import { z } from '@hono/zod-openapi';

export const CreateArtifactTypeSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'document' }),
    description: z.string().default('').openapi({ example: 'A text document' }),
    schema: z.record(z.string(), z.unknown()).openapi({ example: { type: 'object' } }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    autoversion: z
      .boolean()
      .optional()
      .openapi({
        description:
          'When true, compute content hash for deduplication. If existing artifact type with same name and content exists, return it. Otherwise auto-increment version.',
      }),
  })
  .openapi('CreateArtifactType');

export const ArtifactTypeSchema = z
  .object({
    id: z.string().openapi({ example: 'document' }),
    name: z.string(),
    description: z.string(),
    schema: z.record(z.string(), z.unknown()),
    version: z.number().int(),
    contentHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ArtifactType');

export const ArtifactTypeCreateResponseSchema = z
  .object({
    artifactTypeId: z.string(),
    artifactType: ArtifactTypeSchema,
    reused: z
      .boolean()
      .openapi({ description: 'True if an existing artifact type was reused (autoversion matched)' }),
  })
  .openapi('ArtifactTypeCreateResponse');

export const ArtifactTypeGetResponseSchema = z
  .object({
    artifactType: ArtifactTypeSchema,
  })
  .openapi('ArtifactTypeGetResponse');

export const ArtifactTypeListResponseSchema = z
  .object({
    artifactTypes: z.array(ArtifactTypeSchema),
  })
  .openapi('ArtifactTypeListResponse');
