/**
 * Path Parser - Convert OpenAPI paths to route tree
 *
 * Task 1.1: Define Types
 */

const API_PREFIX = 'api/';
const DEFAULT_SUCCESS_STATUS = '200';
const PARAM_START_CHARS = ['{', ':'] as const;
const PARAM_STRIP_CHARS = /^[{:]|[}]$/g;

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
  /** Original OpenAPI path for type generation (e.g., "/api/workspaces/{id}") */
  originalPath?: string;
  /** Success status code from OpenAPI spec (e.g., 200, 201, 204) */
  successStatusCode?: string;
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
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');

  // Strip /api/ prefix if present
  const withoutPrefix = normalized.startsWith(API_PREFIX)
    ? normalized.substring(API_PREFIX.length)
    : normalized;

  // Split by / and filter empty segments
  return withoutPrefix.split('/').filter((segment) => segment.length > 0);
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
  if (PARAM_START_CHARS.some((char) => segment.startsWith(char))) {
    return NodeType.Param;
  }

  // For now, everything else is a collection
  // Action detection will be handled by the tree builder based on position
  return NodeType.Collection;
}

/**
 * Task 1.4: Tree Builder
 *
 * Build a route tree from OpenAPI path definitions.
 * Handles:
 * - Creating nodes for each path segment
 * - Merging duplicate paths (same structure, different HTTP methods)
 * - Detecting action nodes (segments after parameters)
 * - Building parent-child relationships
 */
export interface PathDefinition {
  path: string;
  method: HttpMethod;
  operationId?: string;
  responses?: Record<string, any>;
}

export function buildRouteTree(paths: PathDefinition[]): RouteNode[] {
  const roots: RouteNode[] = [];

  for (const { path, method, operationId, responses } of paths) {
    const segments = parsePathSegments(path);
    let currentLevel = roots;
    let parent: RouteNode | null = null;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentType = classifySegment(segment);

      // Normalize parameter names (strip braces/colons)
      const nodeName =
        segmentType === NodeType.Param ? segment.replace(PARAM_STRIP_CHARS, '') : segment;

      // Find existing node by name (may be collection or action)
      let node = currentLevel.find((n) => n.name === nodeName);

      if (!node) {
        // Determine if this segment is an action
        // Actions are terminal segments (last in path) that appear after parameters
        const isLastSegment = i === segments.length - 1;
        const previousIsParam = i > 0 && classifySegment(segments[i - 1]) === NodeType.Param;
        const isAction = isLastSegment && previousIsParam && segmentType === NodeType.Collection;
        const nodeType = isAction ? NodeType.Action : segmentType;

        node = {
          type: nodeType,
          name: nodeName,
          methods: [],
          children: [],
          parent,
        };
        currentLevel.push(node);
      } else if (node.type === NodeType.Action && i < segments.length - 1) {
        // If we previously classified this as an action, but it has children in this path,
        // it's actually a collection
        node.type = NodeType.Collection;
      }

      // Add method if we're at the final segment
      if (i === segments.length - 1) {
        // Check if method already exists
        const existingMethod = node.methods.find((m) => m.verb === method);
        if (!existingMethod) {
          // Extract first 2xx status code from responses
          const responseCodes = responses || {};
          const successStatusCode =
            Object.keys(responseCodes).find((code) => code.startsWith('2')) ||
            DEFAULT_SUCCESS_STATUS;

          node.methods.push({ verb: method, operationId, originalPath: path, successStatusCode });
        }
      }

      // Move to next level
      parent = node;
      currentLevel = node.children;
    }
  }

  return roots;
}
