/**
 * Fingerprinting utility for workflow definition deduplication.
 *
 * Computes a SHA-256 hash of the structural content of a workflow definition,
 * excluding identity fields (id, name, description) and timestamps.
 */

import type { NodeInput, TransitionInput, WorkflowDefInput } from './validator';

/**
 * Fields included in the fingerprint:
 * - nodes: ref, name, task_id, task_version, input_mapping, output_mapping, resource_bindings
 * - transitions: ref, from_node_ref, to_node_ref, priority, condition, spawn_count,
 *                sibling_group, foreach, synchronization, loop_config
 * - input_schema, output_schema, output_mapping, context_schema
 * - initial_node_ref
 *
 * Fields excluded:
 * - id, version, name, description (identity/metadata)
 * - timestamps (created_at, updated_at)
 * - project_id, library_id, tags (organizational, not structural)
 */

interface FingerprintableNode {
  ref: string;
  name: string;
  task_id?: string;
  task_version?: number;
  input_mapping?: object;
  output_mapping?: object;
  resource_bindings?: Record<string, string>;
}

interface FingerprintableTransition {
  ref?: string;
  from_node_ref: string;
  to_node_ref: string;
  priority: number;
  condition?: object;
  spawn_count?: number;
  sibling_group?: string;
  foreach?: object;
  synchronization?: {
    strategy: string;
    sibling_group: string;
    merge?: object;
  };
  loop_config?: object;
}

interface FingerprintableContent {
  initial_node_ref: string;
  input_schema: object;
  output_schema: object;
  output_mapping?: object;
  context_schema?: object;
  nodes: FingerprintableNode[];
  transitions: FingerprintableTransition[];
}

/**
 * Normalizes a node for fingerprinting by extracting relevant fields.
 */
function normalizeNode(node: NodeInput): FingerprintableNode {
  return {
    ref: node.ref,
    name: node.name,
    task_id: node.task_id,
    task_version: node.task_version,
    input_mapping: node.input_mapping,
    output_mapping: node.output_mapping,
    resource_bindings: node.resource_bindings,
  };
}

/**
 * Normalizes a transition for fingerprinting.
 */
function normalizeTransition(transition: TransitionInput): FingerprintableTransition {
  return {
    ref: transition.ref,
    from_node_ref: transition.from_node_ref,
    to_node_ref: transition.to_node_ref,
    priority: transition.priority,
    condition: transition.condition,
    spawn_count: transition.spawn_count,
    sibling_group: transition.sibling_group,
    foreach: transition.foreach,
    synchronization: transition.synchronization,
    loop_config: transition.loop_config,
  };
}

/**
 * Extracts and normalizes the fingerprintable content from a workflow definition.
 */
function extractFingerprintableContent(data: WorkflowDefInput): FingerprintableContent {
  // Sort nodes by ref for deterministic ordering
  const sortedNodes = [...data.nodes]
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .map(normalizeNode);

  // Sort transitions by from_node_ref, then to_node_ref, then priority
  const sortedTransitions = [...(data.transitions ?? [])]
    .sort((a, b) => {
      const fromCmp = a.from_node_ref.localeCompare(b.from_node_ref);
      if (fromCmp !== 0) return fromCmp;
      const toCmp = a.to_node_ref.localeCompare(b.to_node_ref);
      if (toCmp !== 0) return toCmp;
      return a.priority - b.priority;
    })
    .map(normalizeTransition);

  return {
    initial_node_ref: data.initial_node_ref,
    input_schema: data.input_schema,
    output_schema: data.output_schema,
    output_mapping: data.output_mapping,
    context_schema: data.context_schema,
    nodes: sortedNodes,
    transitions: sortedTransitions,
  };
}

/**
 * Recursively sorts object keys for deterministic JSON serialization.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Computes a SHA-256 fingerprint of a workflow definition's structural content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The workflow definition input
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeFingerprint(data: WorkflowDefInput): Promise<string> {
  const content = extractFingerprintableContent(data);
  const sortedContent = sortObjectKeys(content);

  // Deterministic JSON serialization
  const jsonString = JSON.stringify(sortedContent);

  // Use Web Crypto API (available in Workers)
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
