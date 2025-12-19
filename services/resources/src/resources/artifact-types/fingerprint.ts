/**
 * Fingerprinting utility for artifact type deduplication.
 *
 * Computes a SHA-256 hash of the structural content of an artifact type,
 * excluding identity fields (id, name, description) and timestamps.
 */

import type { ArtifactTypeInput } from './types';

/**
 * Fields included in the fingerprint:
 * - schema
 *
 * Fields excluded:
 * - id, version, name, description (identity/metadata)
 * - timestamps (created_at, updated_at)
 */

interface FingerprintableContent {
  schema: object;
}

/**
 * Extracts and normalizes the fingerprintable content from an artifact type.
 */
function extractFingerprintableContent(data: ArtifactTypeInput): FingerprintableContent {
  return {
    schema: data.schema,
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
 * Computes a SHA-256 fingerprint of an artifact type's structural content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The artifact type input
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeFingerprint(data: ArtifactTypeInput): Promise<string> {
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
