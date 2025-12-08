/**
 * Path Parser - Convert OpenAPI paths to route tree
 *
 * Task 1.1: Define Types
 */

/**
 * HTTP methods supported by the API
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/**
 * Type of route node in the tree
 */
export enum NodeType {
  /** Resource collection (e.g., workspaces, projects) */
  Collection = 'collection',
  /** Path parameter (e.g., {id}, {workspace_id}) */
  Param = 'param',
  /** Custom action endpoint (e.g., start, cancel) */
  Action = 'action',
}

/**
 * HTTP method with optional OpenAPI operationId
 */
export interface RouteMethod {
  verb: HttpMethod;
  operationId?: string;
}

/**
 * Node in the route tree representing a path segment
 */
export interface RouteNode {
  /** Type of node */
  type: NodeType;

  /** Name of the segment (e.g., 'workspaces', 'id', 'start') */
  name: string;

  /** HTTP methods available at this node */
  methods: RouteMethod[];

  /** Child nodes (nested resources/actions) */
  children: RouteNode[];

  /** Parent node reference (null for root nodes) */
  parent: RouteNode | null;
}

/**
 * Task 1.2: Path Segment Parser
 *
 * Parse a single OpenAPI path into segments.
 * Strips /api/ prefix and splits by /.
 */
export function parsePathSegments(path: string): string[] {
  // Remove leading/trailing slashes
  let normalized = path.trim().replace(/^\/+|\/+$/g, '');

  // Strip /api/ prefix if present
  if (normalized.startsWith('api/')) {
    normalized = normalized.substring(4);
  }

  // Split by / and filter empty segments
  return normalized.split('/').filter((segment) => segment.length > 0);
}

/**
 * Task 1.3: Segment Classifier
 *
 * Classify a path segment as collection, param, or action.
 * - Parameters start with { or :
 * - Actions are collection names that appear after a parameter (detected in tree builder)
 * - Everything else is a collection
 */
export function classifySegment(segment: string): NodeType {
  // Parameters start with { or :
  if (segment.startsWith('{') || segment.startsWith(':')) {
    return NodeType.Param;
  }

  // For now, everything else is a collection
  // Action detection will be handled by the tree builder based on position
  return NodeType.Collection;
}
