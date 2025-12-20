/** Type definitions for workspaces */

import { workspaces } from '../../schema';

/** WorkspaceSettings - parsed from workspace_settings table with undefined for missing values */
export type WorkspaceSettings = {
  allowedModelProviders?: string[];
  allowedMcpServers?: string[];
  budgetMaxMonthlySpendCents?: number;
  budgetAlertThresholdCents?: number;
};

/** Workspace entity - base fields from schema plus joined settings */
export type Workspace = typeof workspaces.$inferSelect & {
  settings: WorkspaceSettings | null;
};
