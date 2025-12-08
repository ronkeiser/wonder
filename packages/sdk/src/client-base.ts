/**
 * Runtime utilities for the generated client
 * These types and functions are used by the generated client code
 */

/**
 * Collection methods for resource collections
 * Supports creating new resources and listing existing ones
 */
export interface CollectionMethods<TCreateBody = any, TListQuery = any, TResource = any> {
  create: (body: TCreateBody) => Promise<TResource>;
  list: (query?: TListQuery) => Promise<TResource[]>;
}

/**
 * Collection with instance access
 * A callable function that also has collection methods as properties
 */
export interface CollectionWithInstance<
  TCreateBody = any,
  TListQuery = any,
  TResource = any,
  TUpdateBody = any,
> extends CollectionMethods<TCreateBody, TListQuery, TResource> {
  (id: string): InstanceMethods<TResource, TUpdateBody>;
}

/**
 * Instance methods for individual resources
 * Supports getting, updating, and deleting a specific resource
 */
export interface InstanceMethods<TResource = any, TUpdateBody = any> {
  get: () => Promise<TResource>;
  update: (body: TUpdateBody) => Promise<TResource>;
  delete: () => Promise<void>;
}

/**
 * Generic action method type
 * Used for custom endpoints that don't follow standard CRUD patterns
 */
export type ActionMethod<TBody = any, TResponse = any> = (body?: TBody) => Promise<TResponse>;

/**
 * Configuration for the base HTTP client
 */
export interface ClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

/**
 * Build a full API path from segments with parameter substitution
 * @param segments - Path segments (e.g., ['workspaces', ':id'])
 * @param params - Parameter values to substitute (e.g., { id: '123' })
 * @returns Full path with /api/ prefix (e.g., '/api/workspaces/123')
 * @throws Error if required parameter is missing
 */
export function buildPath(segments: string[], params: Record<string, string> = {}): string {
  const processedSegments = segments.map((segment) => {
    if (segment.startsWith(':')) {
      const paramName = segment.slice(1);
      if (!(paramName in params)) {
        throw new Error(`Missing parameter: ${paramName}`);
      }
      return params[paramName];
    }
    return segment;
  });

  return `/api/${processedSegments.join('/')}`;
}

/**
 * Create collection methods for a resource collection
 * Returns a callable function that provides instance access when called with an ID,
 * and also has collection methods (create, list) as properties
 * @param baseClient - The HTTP client (from openapi-fetch)
 * @param path - The full path to the collection (e.g., '/api/workspaces')
 * @returns Callable object with create and list methods, and instance access via calling
 */
export function createCollection<
  TCreateBody = any,
  TListQuery = any,
  TResource = any,
  TUpdateBody = any,
>(
  baseClient: any,
  path: string,
): CollectionWithInstance<TCreateBody, TListQuery, TResource, TUpdateBody> {
  // Create the callable function that returns instance methods
  const collectionFn = (id: string) => {
    return createInstance<TResource, TUpdateBody>(baseClient, `${path}/:id`, id);
  };

  // Add collection methods as properties
  collectionFn.create = async (body: TCreateBody) => {
    const response = await baseClient.POST(path, { body });
    return response.data;
  };

  collectionFn.list = async (query?: TListQuery) => {
    const options = query ? { params: { query } } : {};
    const response = await baseClient.GET(path, options);
    return response.data;
  };

  return collectionFn as CollectionWithInstance<TCreateBody, TListQuery, TResource, TUpdateBody>;
}

/**
 * Create instance methods for a specific resource
 * @param baseClient - The HTTP client (from openapi-fetch)
 * @param path - The path template with :id placeholder (e.g., '/api/workspaces/:id')
 * @param id - The resource ID to inject into the path
 * @returns Object with get, update, and delete methods
 */
export function createInstance<TResource = any, TUpdateBody = any>(
  baseClient: any,
  path: string,
  id: string,
): InstanceMethods<TResource, TUpdateBody> {
  // Replace :id placeholder with actual ID
  const instancePath = path.replace(':id', id);

  return {
    get: async () => {
      const response = await baseClient.GET(instancePath, {});
      return response.data;
    },
    update: async (body: TUpdateBody) => {
      const response = await baseClient.PUT(instancePath, { body });
      return response.data;
    },
    delete: async () => {
      await baseClient.DELETE(instancePath, {});
    },
  };
}

/**
 * Create a generic action handler for custom endpoints
 * @param baseClient - The HTTP client (from openapi-fetch)
 * @param path - The full path to the action endpoint
 * @param method - The HTTP method to use (GET, POST, PUT, DELETE, etc.)
 * @returns Function that calls the action with optional body
 */
export function createAction<TBody = any, TResponse = any>(
  baseClient: any,
  path: string,
  method: string,
): ActionMethod<TBody, TResponse> {
  return async (body?: TBody) => {
    const options = body ? { body } : {};
    const response = await baseClient[method](path, options);
    return response.data;
  };
}
