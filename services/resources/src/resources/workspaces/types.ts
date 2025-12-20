/** Type definitions for workspaces */

import { workspaceSettings, workspaces } from '../../schema';
import type { NewEntity } from '~/shared/types';

/** WorkspaceSettings - what's returned from DB (all fields present, with | null) */
export type WorkspaceSettings = Omit<typeof workspaceSettings.$inferSelect, 'workspaceId'>;

/** WorkspaceSettingsInput - what's accepted for create/update (partial, with | null) */
export type WorkspaceSettingsInput = Partial<WorkspaceSettings>;

/** API input for creating a workspace - inferred from schema, adds settings */
export type WorkspaceInput = NewEntity<typeof workspaces.$inferInsert> & {
  settings?: WorkspaceSettingsInput | null;
};

/** Workspace entity - base fields from schema plus joined settings */
export type Workspace = typeof workspaces.$inferSelect & {
  settings: WorkspaceSettings | null;
};
