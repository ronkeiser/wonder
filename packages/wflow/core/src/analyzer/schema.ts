import type { JSONSchemaProperty } from '../types/ast.js';

// =============================================================================
// Allowed property sets per primitive (based on primitives.md)
// =============================================================================

export const WORKFLOW_ALLOWED_PROPS = new Set([
  'imports',
  'workflow',
  'version',
  'description',
  'input_schema',
  'context_schema',
  'output_schema',
  'resources',
  'nodes',
  'transitions',
  'initial_node_ref',
  'timeout_ms',
  'on_timeout',
]);

export const NODE_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'name',
  'task_id',
  'task_version',
  'input_mapping',
  'output_mapping',
  'resource_bindings',
]);

export const TRANSITION_ALLOWED_PROPS = new Set([
  // Note: 'ref' is NOT allowed - the YAML map key IS the ref
  'from_node_ref',
  'to_node_ref',
  'priority',
  'condition',
  'spawn_count',
  'foreach',
  'synchronization',
  'loop_config',
]);

export const CONDITION_ALLOWED_PROPS = new Set(['type', 'expr', 'definition', 'reads']);

export const FOREACH_ALLOWED_PROPS = new Set(['collection', 'item_var']);

export const SYNCHRONIZATION_ALLOWED_PROPS = new Set([
  'strategy',
  'sibling_group',
  'timeout_ms',
  'on_timeout',
  'merge',
]);

export const MERGE_ALLOWED_PROPS = new Set(['source', 'target', 'strategy']);

export const RESOURCE_ALLOWED_PROPS = new Set([
  'type',
  'image',
  'repo_id',
  'base_branch',
  'merge_on_success',
  'merge_strategy',
]);

// TaskDef allowed properties
export const TASK_ALLOWED_PROPS = new Set([
  'imports',
  'task',
  'version',
  'name',
  'description',
  'tags',
  'input_schema',
  'output_schema',
  'steps',
  'retry',
  'timeout_ms',
]);

export const STEP_ALLOWED_PROPS = new Set([
  'ref',
  'ordinal',
  'action_id',
  'action_version',
  'input_mapping',
  'output_mapping',
  'on_failure',
  'condition',
]);

export const STEP_CONDITION_ALLOWED_PROPS = new Set(['if', 'then', 'else']);

export const RETRY_ALLOWED_PROPS = new Set([
  'max_attempts',
  'backoff',
  'initial_delay_ms',
  'max_delay_ms',
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

export const ACTION_EXECUTION_ALLOWED_PROPS = new Set(['timeout_ms', 'retry_policy']);

export const ACTION_RETRY_POLICY_ALLOWED_PROPS = new Set([
  'max_attempts',
  'backoff',
  'initial_delay_ms',
  'max_delay_ms',
  'retryable_errors',
]);

export const ACTION_IDEMPOTENCY_ALLOWED_PROPS = new Set(['key_template', 'ttl_seconds']);

// Kind-specific implementation properties
export const IMPLEMENTATION_PROPS_BY_KIND: Record<string, Set<string>> = {
  llm: new Set(['prompt_spec_id', 'model_profile_id']),
  mcp: new Set(['mcp_server_id', 'tool_name']),
  http: new Set(['url_template', 'method', 'headers', 'body_template']),
  tool: new Set(['tool_name', 'tool_version']),
  shell: new Set(['command_template', 'working_dir', 'resource_name']),
  workflow: new Set([
    'workflow_def_id',
    'version',
    'inherit_artifacts',
    'pass_resources',
    'on_failure',
  ]),
  context: new Set(['updates']),
  vector: new Set(['vector_index_id', 'top_k', 'similarity_threshold']),
  metric: new Set(['metric_name', 'value', 'dimensions']),
  human: new Set(['prompt', 'timeout_ms', 'on_timeout']),
};

// Valid action kinds
export const VALID_ACTION_KINDS = [
  'llm',
  'mcp',
  'http',
  'tool',
  'shell',
  'workflow',
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
