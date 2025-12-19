/**
 * Fingerprinting utility for action deduplication.
 *
 * Computes a SHA-256 hash of the structural content of an action,
 * excluding identity fields (id, name, description) and timestamps.
 */

import type { ActionInput } from './types';

/**
 * Fields included in the fingerprint:
 * - kind, implementation
 * - requires, produces, execution, idempotency
 *
 * Fields excluded:
 * - id, version, name, description (identity/metadata)
 * - timestamps (created_at, updated_at)
 */

interface FingerprintableContent {
  kind: string;
  implementation: object;
  requires: object | null;
  produces: object | null;
  execution: object | null;
  idempotency: object | null;
}

/**
 * Extracts and normalizes the fingerprintable content from an action.
 */
function extractFingerprintableContent(data: ActionInput): FingerprintableContent {
  return {
    kind: data.kind,
    implementation: data.implementation,
    requires: data.requires ?? null,
    produces: data.produces ?? null,
    execution: data.execution ?? null,
    idempotency: data.idempotency ?? null,
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
 * Computes a SHA-256 fingerprint of an action's structural content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The action input
 * @returns Object with hex-encoded SHA-256 hash string and the input JSON
 */
export async function computeFingerprint(data: ActionInput): Promise<{ hash: string; input: string }> {
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
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { hash, input: jsonString };
}
