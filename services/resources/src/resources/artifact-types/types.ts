import type { artifactTypes } from '~/schema';

/** ArtifactType entity — inferred from database schema. */
export type ArtifactType = typeof artifactTypes.$inferSelect;

/** API input for creating an artifact type. */
export type ArtifactTypeInput = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  autoversion?: boolean;
  force?: boolean;
};
