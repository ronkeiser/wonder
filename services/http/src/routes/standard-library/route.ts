import { OpenAPIHono } from '@hono/zod-openapi';
import { NotFoundError } from '~/shared/errors';
import type { HttpEnv } from '~/types';
import {
  getStandardLibraryManifestRoute,
  listStandardLibrariesRoute,
  listStandardLibraryDefinitionsRoute,
} from './spec';

export const standardLibrary = new OpenAPIHono<HttpEnv>();

standardLibrary.openapi(listStandardLibrariesRoute, async (c) => {
  using resource = c.env.RESOURCES.libraries();
  const result = await resource.list({ standardOnly: true });
  return c.json(result);
});

standardLibrary.openapi(getStandardLibraryManifestRoute, async (c) => {
  using resource = c.env.RESOURCES.libraries();
  const { manifest } = await resource.getStandardLibraryManifest();
  return c.json(manifest);
});

standardLibrary.openapi(listStandardLibraryDefinitionsRoute, async (c) => {
  const { library: libraryName } = c.req.valid('param');

  using resource = c.env.RESOURCES.libraries();

  // Find the standard library by name
  const { library } = await resource.getByName(libraryName, null);

  if (!library) {
    throw new NotFoundError(`Standard library not found: ${libraryName}`, 'library', libraryName);
  }

  const result = await resource.getLibraryDefinitions(library.id);
  return c.json(result);
});
