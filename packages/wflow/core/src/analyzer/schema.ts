import type { JSONSchemaProperty } from '../types/ast.js';

// =============================================================================
// Allowed property sets per primitive (based on primitives.md)
// =============================================================================

export const WORKFLOW_ALLOWED_PROPS = new Set([
  'imports',
  'workflow',
  'version',
  'description',
  'inputSchema',
  'contextSchema',
  'outputSchema',
  'outputMapping',
  'resources',
  'nodes',
  'transitions',
  'initialNodeRef',
  'timeoutMs',
  'onTimeout',
]);

export const NODE_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'name',
  'taskId',
  'taskVersion',
  'inputMapping',
  'outputMapping',
  'resourceBindings',
]);

export const TRANSITION_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'fromNodeRef',
  'toNodeRef',
  'priority',
  'condition',
  'spawnCount',
  'foreach',
  'synchronization',
  'loopConfig',
]);

export const CONDITION_ALLOWED_PROPS = new Set(['type', 'expr', 'definition', 'reads']);

export const FOREACH_ALLOWED_PROPS = new Set(['collection', 'itemVar']);

export const SYNCHRONIZATION_ALLOWED_PROPS = new Set([
  'strategy',
  'siblingGroup',
  'timeoutMs',
  'onTimeout',
  'merge',
]);

export const MERGE_ALLOWED_PROPS = new Set(['source', 'target', 'strategy']);

export const RESOURCE_ALLOWED_PROPS = new Set([
  'type',
  'image',
  'repoId',
  'baseBranch',
  'mergeOnSuccess',
  'mergeStrategy',
]);

// Task allowed properties
export const TASK_ALLOWED_PROPS = new Set([
  'imports',
  'task',
  'version',
  'name',
  'description',
  'tags',
  'inputSchema',
  'outputSchema',
  'steps',
  'retry',
  'timeoutMs',
]);

export const STEP_ALLOWED_PROPS = new Set([
  'ref',
  'ordinal',
  'actionId',
  'actionVersion',
  'inputMapping',
  'outputMapping',
  'onFailure',
  'condition',
]);

export const STEP_CONDITION_ALLOWED_PROPS = new Set(['if', 'then', 'else']);

export const RETRY_ALLOWED_PROPS = new Set([
  'maxAttempts',
  'backoff',
  'initialDelayMs',
  'maxDelayMs',
]);

// ActionDef allowed properties
export const ACTION_ALLOWED_PROPS = new Set([
  'imports',
  'action',
  'version',
  'name',
  'description',
  'kind',
  'implementation',
  'requires',
  'produces',
  'execution',
  'idempotency',
]);

export const ACTION_EXECUTION_ALLOWED_PROPS = new Set(['timeoutMs', 'retryPolicy']);

export const ACTION_RETRY_POLICY_ALLOWED_PROPS = new Set([
  'maxAttempts',
  'backoff',
  'initialDelayMs',
  'maxDelayMs',
  'retryableErrors',
]);

export const ACTION_IDEMPOTENCY_ALLOWED_PROPS = new Set(['keyTemplate', 'ttlSeconds']);

// Persona allowed properties
export const PERSONA_ALLOWED_PROPS = new Set([
  'imports',
  'persona',
  'description',
  'systemPrompt',
  'modelProfileId',
  'contextAssemblyWorkflowId',
  'memoryExtractionWorkflowId',
  'recentTurnsLimit',
  'toolIds',
  'constraints',
]);

export const PERSONA_CONSTRAINTS_ALLOWED_PROPS = new Set(['maxMovesPerTurn']);

// Tool allowed properties
export const TOOL_ALLOWED_PROPS = new Set([
  'imports',
  'tool',
  'description',
  'inputSchema',
  'targetType',
  'targetId',
  'async',
  'invocationMode',
  'inputMapping',
  'retry',
]);

export const TOOL_RETRY_ALLOWED_PROPS = new Set(['maxAttempts', 'backoffMs', 'timeoutMs']);

// Valid tool target types
export const VALID_TOOL_TARGET_TYPES = ['task', 'workflow', 'agent'] as const;

// Valid tool invocation modes
export const VALID_TOOL_INVOCATION_MODES = ['delegate', 'loop_in'] as const;

// Kind-specific implementation properties
export const IMPLEMENTATION_PROPS_BY_KIND: Record<string, Set<string>> = {
  llm: new Set(['promptSpecId', 'modelProfileId']),
  mcp: new Set(['mcpServerId', 'toolName']),
  http: new Set(['urlTemplate', 'method', 'headers', 'bodyTemplate']),
  tool: new Set(['toolName', 'toolVersion']),
  shell: new Set(['commandTemplate', 'workingDir', 'resourceName']),
  context: new Set(['updates']),
  vector: new Set(['vectorIndexId', 'topK', 'similarityThreshold']),
  metric: new Set(['metricName', 'value', 'dimensions']),
  human: new Set(['prompt', 'timeoutMs', 'onTimeout']),
};

// Valid action kinds
export const VALID_ACTION_KINDS = [
  'llm',
  'mcp',
  'http',
  'tool',
  'shell',
  'context',
  'vector',
  'metric',
  'human',
] as const;

// JSON Schema allowed properties (subset we support)
export const JSON_SCHEMA_ALLOWED_PROPS = new Set([
  'type',
  'properties',
  'items',
  'required',
  'enum',
  'const',
  'description',
  'default',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'additionalProperties',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  '$ref',
  'title',
  'examples',
  'nullable',
]);

// =============================================================================
// Schema path extraction
// =============================================================================

/**
 * Extract all valid paths from a JSON Schema
 */
export function extractPaths(schema: JSONSchemaProperty | undefined, prefix: string): Set<string> {
  const paths = new Set<string>();
  if (!schema) return paths;

  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);

      // Recurse into nested objects
      if (value.type === 'object' && value.properties) {
        for (const nested of extractPaths(value, path)) {
          paths.add(nested);
        }
      }
    }
  }

  return paths;
}

/**
 * Find similar paths for suggestions (simple matching)
 */
export function findSimilarPaths(target: string, validPaths: Set<string>): string[] {
  const suggestions: string[] = [];
  const targetLower = target.toLowerCase();

  for (const path of validPaths) {
    const pathLower = path.toLowerCase();
    // Check if one contains the other, or they share a suffix
    if (pathLower.includes(targetLower) || targetLower.includes(pathLower)) {
      suggestions.push(path);
    } else if (path.split('.').pop() === target.split('.').pop()) {
      suggestions.push(path);
    }
  }

  return suggestions.slice(0, 3);
}

/**
 * Navigate into a JSON Schema to find the property at a path
 */
export function getSchemaPropertyAtPath(
  schema: JSONSchemaProperty | undefined,
  pathParts: string[],
): JSONSchemaProperty | undefined {
  if (!schema) return undefined;

  let current: JSONSchemaProperty | undefined = schema;

  for (const part of pathParts) {
    if (!current?.properties?.[part]) {
      return undefined;
    }
    current = current.properties[part];
  }

  return current;
}

/**
 * Check if an object has unknown properties
 */
export function findUnknownProps(obj: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((key) => !allowed.has(key));
}
