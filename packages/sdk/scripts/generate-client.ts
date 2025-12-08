/**
 * Client Generator - Convert route tree to TypeScript client code
 *
 * Task 2.1: HTTP Verb Mapping
 */

import { HttpMethod, NodeType, RouteNode } from './parse-paths';

/**
 * Map HTTP verb to JavaScript method name
 *
 * Rules:
 * - POST on collection → create()
 * - POST on action → use action name (e.g., start())
 * - GET on collection → list()
 * - GET on instance (param) → get()
 * - PUT → update()
 * - DELETE → delete()
 * - PATCH → patch()
 */
export function getMethodName(node: RouteNode, verb: HttpMethod): string {
  if (verb === 'post') {
    return node.type === NodeType.Action ? node.name : 'create';
  }

  if (verb === 'get') {
    return node.type === NodeType.Collection ? 'list' : 'get';
  }

  if (verb === 'put') {
    return 'update';
  }

  // delete, patch map directly
  return verb;
}

/**
 * Task 2.2: Path Template Builder
 *
 * Build path template string with parameter interpolation.
 * Walk from node to root, collecting segments, then reverse.
 */
export function buildPathTemplate(node: RouteNode): string {
  const segments: string[] = [];
  let current: RouteNode | null = node;

  while (current) {
    if (current.type === NodeType.Param) {
      segments.unshift(`\${${current.name}}`);
    } else {
      segments.unshift(current.name);
    }
    current = current.parent;
  }

  return `/api/${segments.join('/')}`;
}

/**
 * Task 2.3: Method Signature Generator
 *
 * Generate method signature information including parameter list.
 */

export interface MethodParameter {
  name: string;
  type: 'string' | 'body' | 'options';
  optional: boolean;
}

export interface MethodSignature {
  name: string;
  parameters: MethodParameter[];
}

/**
 * Collect path parameters from node ancestry
 */
function collectPathParameters(node: RouteNode): string[] {
  const params: string[] = [];
  let current: RouteNode | null = node;

  while (current) {
    if (current.type === NodeType.Param) {
      params.unshift(current.name);
    }
    current = current.parent;
  }

  return params;
}

/**
 * Generate method signature with proper parameter list
 */
export function generateMethodSignature(
  node: RouteNode,
  verb: HttpMethod,
  operationId?: string,
): MethodSignature {
  const methodName = getMethodName(node, verb);
  const parameters: MethodParameter[] = [];

  // Add path parameters
  const pathParams = collectPathParameters(node);
  for (const param of pathParams) {
    parameters.push({
      name: param,
      type: 'string',
      optional: false,
    });
  }

  // Add body parameter for mutation methods
  if (['post', 'put', 'patch'].includes(verb)) {
    parameters.push({
      name: 'body',
      type: 'body',
      optional: false,
    });
  }

  // Add options parameter (always optional)
  parameters.push({
    name: 'options',
    type: 'options',
    optional: true,
  });

  return { name: methodName, parameters };
}

/**
 * Task 2.4: Collection Object Generator
 *
 * Generate object structure for collection nodes.
 */

export interface ClientMethod {
  name: string;
  signature: MethodSignature;
  path: string;
  verb: HttpMethod;
}

export interface ClientProperty {
  name: string;
  type: 'method' | 'collection' | 'parameter';
  methods?: ClientMethod[];
  children?: ClientProperty[];
}

/**
 * Generate collection object structure with methods and nested resources
 */
export function generateCollectionObject(node: RouteNode): ClientProperty {
  const properties: ClientProperty[] = [];

  // Add methods for this node
  const methods: ClientMethod[] = [];
  for (const method of node.methods) {
    methods.push({
      name: getMethodName(node, method.verb),
      signature: generateMethodSignature(node, method.verb, method.operationId),
      path: buildPathTemplate(node),
      verb: method.verb,
    });
  }

  // Add child resources/actions as nested properties
  for (const child of node.children) {
    if (child.type === NodeType.Param) {
      properties.push({
        name: child.name,
        type: 'parameter',
        children: [generateCollectionObject(child)],
      });
    } else {
      properties.push(generateCollectionObject(child));
    }
  }

  return {
    name: node.name,
    type: node.type === NodeType.Param ? 'parameter' : 'collection',
    methods,
    children: properties,
  };
}

/**
 * Task 2.6: Root Client Generator
 *
 * Generate the root client structure with all collections.
 */

export interface ClientStructure {
  collections: ClientProperty[];
}

/**
 * Generate complete client structure from route tree roots
 */
export function generateRootClient(roots: RouteNode[]): ClientStructure {
  const collections: ClientProperty[] = [];

  for (const root of roots) {
    collections.push(generateCollectionObject(root));
  }

  return { collections };
}

/**
 * Task 3.4: Client Code Formatting
 *
 * Format client structure as complete TypeScript module
 */
export function formatClientCode(structure: ClientStructure): string {
  const lines: string[] = [];

  // JSDoc header
  lines.push('/**');
  lines.push(' * Generated client for Wonder API');
  lines.push(' * This file was auto-generated. Do not edit manually.');
  lines.push(' */');
  lines.push('');

  // Imports
  lines.push("import type { paths } from './schema.js';");
  lines.push("import type { SchemaType } from '@wonder/context';");
  lines.push('');

  // Create client function
  lines.push('/**');
  lines.push(' * Create a typed client for the Wonder API');
  lines.push(' * @param baseClient - The underlying HTTP client (from openapi-fetch)');
  lines.push(' */');
  lines.push('export function createClient(baseClient: any) {');
  lines.push('  return {');

  // Add collection properties
  for (let i = 0; i < structure.collections.length; i++) {
    const collection = structure.collections[i];
    const isLast = i === structure.collections.length - 1;

    // Quote property names that aren't valid identifiers
    const propertyName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(collection.name)
      ? collection.name
      : `"${collection.name}"`;

    lines.push(`    ${propertyName}: {`);
    lines.push('      // Collection methods');
    lines.push('    }' + (isLast ? '' : ','));
  }

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
