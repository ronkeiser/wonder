/** Type definitions for artifact types */

/**
 * ArtifactType entity - the API-facing shape.
 * Internally stored in the unified `definitions` table.
 */
export type ArtifactType = {
  id: string;
  version: number;
  name: string;
  description: string;
  schema: object;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * API input for creating an artifact type.
 */
export type ArtifactTypeInput = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  autoversion?: boolean;
};
