/**
 * Content fingerprinting for version deduplication.
 *
 * Computes a SHA-256 hash of entity content. The caller passes only the
 * hashable fields — versioning/metadata columns are not included.
 *
 * Generated ID fields (ULIDs for nodes, transitions, steps) are stripped
 * at all nesting levels so that identical authored content always produces
 * the same hash regardless of generated IDs.
 */

/**
 * Fields stripped at ALL nesting levels. These are generated identity
 * fields (ULIDs or values derived from ULIDs) that are not user-authored:
 *
 * - `id`: Generated ULID for steps, nodes, transitions
 * - `initialNodeId`: Derived from generated node ULID (authored as `initialNodeRef`)
 * - `fromNodeId`: Derived from generated node ULID (authored as `fromNodeRef`)
 * - `toNodeId`: Derived from generated node ULID (authored as `toNodeRef`)
 */
const GENERATED_ID_FIELDS = new Set([
  'id',
  'initialNodeId',
  'fromNodeId',
  'toNodeId',
]);

/**
 * Recursively sorts object keys for deterministic JSON serialization,
 * stripping generated ID fields at every level.
 */
function sortAndStripKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortAndStripKeys);
  }
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (!GENERATED_ID_FIELDS.has(key)) {
        sorted[key] = sortAndStripKeys((obj as Record<string, unknown>)[key]);
      }
    }
    return sorted;
  }
  return obj;
}

/**
 * Computes a SHA-256 fingerprint of entity content.
 *
 * The caller is responsible for passing only the fields that should
 * affect versioning (entity-specific content, not metadata).
 *
 * Uses the Web Crypto API (available in Cloudflare Workers runtime).
 */
export async function computeContentHash(content: Record<string, unknown>): Promise<string> {
  const sorted = sortAndStripKeys(content);
  const jsonString = JSON.stringify(sorted);

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
