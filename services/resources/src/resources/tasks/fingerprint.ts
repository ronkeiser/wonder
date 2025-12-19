/**
 * Fingerprinting utility for task deduplication.
 *
 * Computes a SHA-256 hash of the structural content of a task,
 * excluding identity fields (id, name, description) and timestamps.
 */

import type { RetryConfig } from '../../schema';
import type { StepInput, TaskInput } from './types';

/**
 * Fields included in the fingerprint:
 * - input_schema, output_schema
 * - steps: ref, ordinal, action_id, action_version, input_mapping, output_mapping, on_failure, condition
 * - retry, timeout_ms
 *
 * Fields excluded:
 * - id, version, name, description (identity/metadata)
 * - timestamps (created_at, updated_at)
 * - project_id, library_id, tags (organizational, not structural)
 * - step.id (generated, not structural)
 */

interface FingerprintableStep {
  ref: string;
  ordinal: number;
  action_id: string;
  action_version: number;
  input_mapping: object | null;
  output_mapping: object | null;
  on_failure: 'abort' | 'retry' | 'continue';
  condition: {
    if: string;
    then: 'continue' | 'skip' | 'succeed' | 'fail';
    else: 'continue' | 'skip' | 'succeed' | 'fail';
  } | null;
}

interface FingerprintableContent {
  input_schema: object;
  output_schema: object;
  steps: FingerprintableStep[];
  retry: RetryConfig | null;
  timeout_ms: number | null;
}

/**
 * Normalizes a step for fingerprinting by extracting relevant fields (excluding id).
 */
function normalizeStep(step: StepInput): FingerprintableStep {
  return {
    ref: step.ref,
    ordinal: step.ordinal,
    action_id: step.action_id,
    action_version: step.action_version,
    input_mapping: step.input_mapping ?? null,
    output_mapping: step.output_mapping ?? null,
    on_failure: step.on_failure,
    condition: step.condition ?? null,
  };
}

/**
 * Extracts and normalizes the fingerprintable content from a task.
 */
function extractFingerprintableContent(data: TaskInput): FingerprintableContent {
  // Sort steps by ordinal for deterministic ordering
  const sortedSteps = [...data.steps].sort((a, b) => a.ordinal - b.ordinal).map(normalizeStep);

  return {
    input_schema: data.input_schema,
    output_schema: data.output_schema,
    steps: sortedSteps,
    retry: data.retry ?? null,
    timeout_ms: data.timeout_ms ?? null,
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
 * Computes a SHA-256 fingerprint of a task's structural content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The task input
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeFingerprint(data: TaskInput): Promise<string> {
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
