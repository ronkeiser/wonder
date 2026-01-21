/**
 * Shared fingerprinting utility for content-based deduplication.
 *
 * Computes a SHA-256 hash of an object's structural content,
 * automatically excluding common identity/metadata fields.
 */

/**
 * Fields that are excluded from fingerprinting across all resources.
 * These are identity, organizational, or system-managed fields.
 *
 * Note: `name` is NOT excluded - it's user-facing content that should affect versioning.
 * `reference` is the stable identity used for autoversion scoping.
 */
const METADATA_FIELDS = new Set([
  'id',
  'version',
  'reference',
  'description',
  'created_at',
  'updated_at',
  'createdAt',
  'updatedAt',
  'tags',
  'project_id',
  'library_id',
  'projectId',
  'libraryId',
  'autoversion',
  'content_hash',
  'contentHash',
]);

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
 * Extracts content fields from an object by excluding metadata fields.
 */
function extractContent(data: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!METADATA_FIELDS.has(key)) {
      content[key] = value;
    }
  }
  return content;
}

/**
 * Computes a SHA-256 fingerprint of an object's structural content.
 *
 * Automatically excludes metadata fields (id, version, reference, description,
 * timestamps, tags, project_id, library_id, autoversion, content_hash).
 *
 * Note: `name` is included in the hash since it's user-facing content.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 *
 * @param data - The object to fingerprint
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeContentHash(data: Record<string, unknown>): Promise<string> {
  const content = extractContent(data);
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

/**
 * Get the keys that will be included in the content hash (for debugging)
 */
export function getContentKeys(data: Record<string, unknown>): string[] {
  const content = extractContent(data);
  return Object.keys(content).sort();
}

/**
 * Get the JSON that will be hashed (for debugging)
 */
export function getContentJson(data: Record<string, unknown>): string {
  const content = extractContent(data);
  const sortedContent = sortObjectKeys(content);
  return JSON.stringify(sortedContent);
}
