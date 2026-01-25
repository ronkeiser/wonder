import { z } from '@hono/zod-openapi';
import { LibrarySchema } from '../libraries/schema';

export const StandardLibraryListResponseSchema = z
  .object({
    libraries: z.array(LibrarySchema),
  })
  .openapi('StandardLibraryListResponse');

/** All definition types supported in libraries */
const definitionTypeEnum = z.enum([
  'workflow',
  'task',
  'action',
  'tool',
  'persona',
  'prompt_spec',
  'artifact_type',
  'model_profile',
]);

export const StandardLibraryManifestSchema = z
  .object({
    libraries: z.record(
      z.string(),
      z.object({
        definitions: z.record(z.string(), definitionTypeEnum),
      }),
    ),
  })
  .openapi('StandardLibraryManifest');

export const StandardLibraryDefinitionsResponseSchema = z
  .object({
    definitions: z.array(
      z.object({
        name: z.string(),
        type: definitionTypeEnum,
        id: z.string(),
      }),
    ),
  })
  .openapi('StandardLibraryDefinitionsResponse');
