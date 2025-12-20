/** Type definitions for projects */

import { projectSettings, projects } from '../../schema';
import type { NewEntity } from '~/shared/types';

/** ProjectSettings - what's returned from DB (all fields present, with | null) */
export type ProjectSettings = Omit<typeof projectSettings.$inferSelect, 'projectId'>;

/** ProjectSettingsInput - what's accepted for create/update (partial, with | null) */
export type ProjectSettingsInput = Partial<ProjectSettings>;

/** API input for creating a project - inferred from schema, adds settings */
export type ProjectInput = NewEntity<typeof projects.$inferInsert> & {
  settings?: ProjectSettingsInput | null;
};

/** Project entity - base fields from schema plus joined settings */
export type Project = typeof projects.$inferSelect & {
  settings: ProjectSettings | null;
};
