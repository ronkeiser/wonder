/** Type definitions for artifact types */

import { artifactTypes } from '../../schema';

/** ArtifactType entity - inferred from database schema */
export type ArtifactType = typeof artifactTypes.$inferSelect;

export type ArtifactTypeInput = {
  version?: number;
  name: string;
  description?: string;
  schema: object;
  autoversion?: boolean;
};
