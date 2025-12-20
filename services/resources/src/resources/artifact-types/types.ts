/** Type definitions for artifact types */

import { artifactTypes } from '../../schema';
import type { NewEntity } from '~/shared/types';

/** ArtifactType entity - inferred from database schema */
export type ArtifactType = typeof artifactTypes.$inferSelect;

/** Base input for creating an artifact type - inferred from schema */
type ArtifactTypeInsert = NewEntity<typeof artifactTypes.$inferInsert>;

/** API input for creating an artifact type - adds autoversion option */
export type ArtifactTypeInput = Omit<ArtifactTypeInsert, 'contentHash'> & {
  autoversion?: boolean;
};
