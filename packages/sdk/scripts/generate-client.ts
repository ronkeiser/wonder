/**
 * Client Generator - Convert route tree to TypeScript client code
 *
 * Task 2.1: HTTP Verb Mapping
 */

import { HttpMethod, NodeType, RouteNode } from './parse-paths';

const API_PREFIX = '/api/';
const CONTENT_TYPE = 'application/json';
const DEFAULT_STATUS_CODE = '200';

/**
 * Map HTTP verb to JavaScript method name
 * POST on action uses action name, otherwise follows REST conventions
 */
export function getMethodName(node: RouteNode, verb: HttpMethod): string {
  if (verb === 'post' && node.type === NodeType.Action) return node.name;

  const methodMap: Record<string, string> = {
    post: 'create',
    get: node.type === NodeType.Collection ? 'list' : 'get',
    put: 'update',
  };

  return methodMap[verb] || verb;
}

/**
 * Task 2.2: Path Template Builder
 *
 * Build path template string with parameter interpolation.
 * Walk from node to root, collecting segments, then reverse.
 */
export function buildPathTemplate(node: RouteNode): string {
  const segments: string[] = [];
  for (let current: RouteNode | null = node; current; current = current.parent) {
    const segment = current.type === NodeType.Param ? `\${${current.name}}` : current.name;
    segments.unshift(segment);
  }
  return API_PREFIX + segments.join('/');
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
  for (let current: RouteNode | null = node; current; current = current.parent) {
    if (current.type === NodeType.Param) {
      params.unshift(current.name);
    }
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
  const isMutation = verb === 'post' || verb === 'put' || verb === 'patch';
  if (isMutation) {
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
  /** Original OpenAPI path for type generation (e.g., "/api/workspaces/{id}") */
  originalPath: string;
  /** Success status code from OpenAPI spec (e.g., '200', '201', '204') */
  successStatusCode: string;
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
  const methods = node.methods.map((method) => ({
    name: getMethodName(node, method.verb),
    signature: generateMethodSignature(node, method.verb, method.operationId),
    path: buildPathTemplate(node),
    verb: method.verb,
    originalPath: method.originalPath || buildPathTemplate(node),
    successStatusCode: method.successStatusCode || DEFAULT_STATUS_CODE,
  }));

  const properties = node.children.map((child) =>
    child.type === NodeType.Param
      ? {
          name: child.name,
          type: 'parameter' as const,
          children: [generateCollectionObject(child)],
        }
      : generateCollectionObject(child),
  );

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
  return { collections: roots.map(generateCollectionObject) };
}

/**
 * Task 3.4: Client Code Formatting
 *
 * Format client structure as complete TypeScript module
 */

/**
 * Build type reference for OpenAPI paths
 */
function buildRequestBodyType(originalPath: string, verb: HttpMethod): string {
  // RequestBody is optional, so we use NonNullable to unwrap it
  return `NonNullable<paths['${originalPath}']['${verb}']['requestBody']>['content']['${CONTENT_TYPE}']`;
}

function buildResponseType(originalPath: string, verb: HttpMethod, statusCode: string): string {
  return `paths['${originalPath}']['${verb}']['responses']['${statusCode}']['content']['${CONTENT_TYPE}']`;
}

/**
 * Generate code for a single method
 * @param excludeParams - Path parameters to exclude (already captured in closure)
 */
function formatMethod(
  method: ClientMethod,
  indent: string,
  excludeParams: Set<string> = new Set(),
): string {
  const getParamType = (p: MethodParameter): string => {
    if (p.type === 'body') return buildRequestBodyType(method.originalPath, method.verb);
    if (p.type === 'options') return 'any';
    return 'string';
  };

  const params = method.signature.parameters
    .filter((p) => !excludeParams.has(p.name))
    .map((p) => `${p.name}${p.optional ? '?' : ''}: ${getParamType(p)}`);

  const hasBody = method.signature.parameters.some((p) => p.name === 'body');
  const bodyParam = hasBody ? '{ body }' : '{}';
  const returnType = buildResponseType(method.originalPath, method.verb, method.successStatusCode);

  return `${indent}${method.name}: async (${params.join(', ')}): Promise<${returnType}> => {
${indent}  const response = await baseClient.${method.verb.toUpperCase()}(\`${method.path}\`, ${bodyParam});
${indent}  return response.data;
${indent}}`;
}

/**
 * Helper to join array items with proper comma placement
 */
function joinWithCommas<T>(items: T[], formatter: (item: T) => string): string[] {
  return items.map((item, i) => formatter(item) + (i < items.length - 1 ? ',' : ''));
}

/**
 * Generate code for a property (collection or parameter)
 */
function formatProperty(prop: ClientProperty, indent: string): string {
  const lines: string[] = [];
  const propertyName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(prop.name) ? prop.name : `"${prop.name}"`;

  if (prop.type === 'parameter') {
    // Parameter nodes become functions that return objects with instance methods
    const child = prop.children?.[0];
    if (!child) {
      throw new Error(`Parameter ${prop.name} has no children`);
    }

    lines.push(`${indent}(${prop.name}: string) => ({`);

    // The parameter is captured, so exclude it from method signatures
    const excludeParams = new Set([prop.name]);

    // Add instance methods
    if (child.methods) {
      const methods = child.methods;
      const hasChildren = child.children && child.children.length > 0;
      const methodLines = methods.map((method, i) => {
        const isLast = i === methods.length - 1 && !hasChildren;
        return formatMethod(method, indent + '    ', excludeParams) + (isLast ? '' : ',');
      });
      lines.push(...methodLines);
    }

    // Add nested children (like actions)
    if (child.children) {
      const allActionMethods = child.children.flatMap((nestedChild) => nestedChild.methods || []);
      if (allActionMethods.length > 0) {
        const actionLines = joinWithCommas(allActionMethods, (method) =>
          formatMethod(method, indent + '    ', excludeParams),
        );
        lines.push(...actionLines);
      }
    }

    lines.push(`${indent}  })`);
  } else {
    // Collection nodes - check if they have param children (need callable pattern)
    const hasParamChild = prop.children?.some((c) => c.type === 'parameter');

    if (hasParamChild) {
      // Generate Object.assign pattern for callable collections
      lines.push(`${indent}${propertyName}: Object.assign(`);

      // Generate the function part (for instance access)
      const paramChild = prop.children!.find((c) => c.type === 'parameter')!;
      lines.push(`${indent}  ` + formatProperty(paramChild, '').replace(/^  /, ''));
      lines.push(`${indent}  ,`);

      // Generate the methods object part (for collection methods)
      lines.push(`${indent}  {`);
      if (prop.methods) {
        const methodLines = joinWithCommas(prop.methods, (method) =>
          formatMethod(method, indent + '    '),
        );
        lines.push(...methodLines);
      }
      lines.push(`${indent}  }`);
      lines.push(`${indent})`);
    } else {
      // Simple collection with just methods
      lines.push(`${indent}${propertyName}: {`);
      if (prop.methods) {
        const methodLines = joinWithCommas(prop.methods, (method) =>
          formatMethod(method, indent + '  '),
        );
        lines.push(...methodLines);
      }
      lines.push(`${indent}}`);
    }
  }

  return lines.join('\n');
}

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
  const collectionLines = joinWithCommas(structure.collections, (collection) =>
    formatProperty(collection, '    '),
  );
  lines.push(...collectionLines);

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
