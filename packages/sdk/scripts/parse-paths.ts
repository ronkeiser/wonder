/**
 * Path Parser - Convert OpenAPI paths to route tree
 *
 * Task 1.1: Define Types
 */

const API_PREFIX = 'api/';
const DEFAULT_SUCCESS_STATUS = '200';
const PARAM_MARKERS = { start: ['{', ':'], strip: /^[{:]|[}]$/g } as const;

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
  /** Path parameter (e.g., {id}, {workspaceId}) */
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
  /** Response content types (e.g., ['application/json', 'text/event-stream']) */
  responseContentTypes?: string[];
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
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');
  const withoutPrefix = normalized.startsWith(API_PREFIX)
    ? normalized.slice(API_PREFIX.length)
    : normalized;

  return withoutPrefix.split('/').filter(Boolean);
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
  return PARAM_MARKERS.start.some((marker) => segment.startsWith(marker))
    ? NodeType.Param
    : NodeType.Collection;
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
  responses?: Record<string, unknown>;
  /** Response content types extracted from OpenAPI spec */
  responseContentTypes?: string[];
}

export function buildRouteTree(paths: PathDefinition[]): RouteNode[] {
  const roots: RouteNode[] = [];

  for (const { path, method, operationId, responses, responseContentTypes } of paths) {
    const segments = parsePathSegments(path);
    const segmentTypes = segments.map(classifySegment);
    let currentLevel = roots;
    let parent: RouteNode | null = null;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentType = segmentTypes[i];
      const isLast = i === segments.length - 1;
      const prevIsParam = i > 0 && segmentTypes[i - 1] === NodeType.Param;

      // Normalize parameter names (strip braces/colons)
      const name =
        segmentType === NodeType.Param ? segment.replace(PARAM_MARKERS.strip, '') : segment;

      // Find or create node
      let node = currentLevel.find((n) => n.name === name);

      if (!node) {
        const isAction = isLast && prevIsParam && segmentType === NodeType.Collection;
        node = {
          type: isAction ? NodeType.Action : segmentType,
          name,
          methods: [],
          children: [],
          parent,
        };
        currentLevel.push(node);
      } else if (node.type === NodeType.Action && !isLast) {
        // Reclassify as collection if it has children
        node.type = NodeType.Collection;
      }

      // Add method at final segment
      if (isLast && !node.methods.some((m) => m.verb === method)) {
        // Find first 2xx status code
        // Note: Status codes like 101 (WebSocket) or 1xx (informational) are not considered success codes
        const successStatusCode = Object.keys(responses ?? {}).find((code) => /^2\d\d$/.test(code));

        // Skip endpoints without a 2xx response (e.g., WebSocket upgrades that only return 101)
        if (!successStatusCode && responses && Object.keys(responses).length > 0) {
          continue;
        }

        node.methods.push({
          verb: method,
          operationId,
          originalPath: path,
          successStatusCode: successStatusCode ?? DEFAULT_SUCCESS_STATUS,
          responseContentTypes,
        });
      }

      parent = node;
      currentLevel = node.children;
    }
  }

  return roots;
}
