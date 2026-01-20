import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateLibrarySchema = z
  .object({
    workspaceId: z.string().optional().openapi({ example: 'ws_123' }),
    name: z.string().min(1).max(255).openapi({ example: 'my-utilities' }),
    description: z.string().optional().openapi({ example: 'Shared utility definitions' }),
  })
  .openapi('CreateLibrary');

export const LibrarySchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    workspaceId: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Library');

export const LibraryCreateResponseSchema = z
  .object({
    libraryId: z.string(),
    library: LibrarySchema,
  })
  .openapi('LibraryCreateResponse');

export const LibraryGetResponseSchema = z
  .object({
    library: LibrarySchema,
  })
  .openapi('LibraryGetResponse');

export const LibraryListResponseSchema = z
  .object({
    libraries: z.array(LibrarySchema),
  })
  .openapi('LibraryListResponse');
