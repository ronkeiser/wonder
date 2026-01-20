import { z } from '@hono/zod-openapi';
import { LibrarySchema } from '../libraries/schema';

export const StandardLibraryListResponseSchema = z
  .object({
    libraries: z.array(LibrarySchema),
  })
  .openapi('StandardLibraryListResponse');

export const StandardLibraryManifestSchema = z
  .object({
    libraries: z.record(
      z.string(),
      z.object({
        definitions: z.record(z.string(), z.enum(['workflow', 'task', 'action', 'tool'])),
      }),
    ),
  })
  .openapi('StandardLibraryManifest');

export const StandardLibraryDefinitionsResponseSchema = z
  .object({
    definitions: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['workflow', 'task', 'action', 'tool']),
        id: z.string(),
      }),
    ),
  })
  .openapi('StandardLibraryDefinitionsResponse');
