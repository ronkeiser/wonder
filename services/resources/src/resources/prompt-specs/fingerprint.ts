/**
 * Fingerprinting utility for prompt spec deduplication.
 *
 * Computes a SHA-256 hash of the structural content of a prompt spec,
 * excluding identity fields (id, name, description) and timestamps.
 */

import type { PromptSpecInput } from './types';

/**
 * Fields included in the fingerprint:
 * - system_prompt, template, template_language
 * - requires, produces, examples
 *
 * Fields excluded:
 * - id, version, name, description (identity/metadata)
 * - timestamps (created_at, updated_at)
 * - tags (organizational, not structural)
 */

interface FingerprintableContent {
  system_prompt: string | null;
  template: string;
  template_language: 'handlebars' | 'jinja2';
  requires: object;
  produces: object;
  examples: object | null;
}

/**
 * Extracts and normalizes the fingerprintable content from a prompt spec.
 */
function extractFingerprintableContent(data: PromptSpecInput): FingerprintableContent {
  return {
    system_prompt: data.system_prompt ?? null,
    template: data.template,
    template_language: data.template_language ?? 'handlebars',
    requires: data.requires ?? {},
    produces: data.produces ?? {},
    examples: data.examples ?? null,
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
 * Computes a SHA-256 fingerprint of a prompt spec's structural content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The prompt spec input
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeFingerprint(data: PromptSpecInput): Promise<string> {
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
