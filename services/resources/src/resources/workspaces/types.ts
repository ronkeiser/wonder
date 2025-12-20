/** Type definitions for workspaces */

export type WorkspaceSettings = {
  allowedModelProviders?: string[];
  allowedMcpServers?: string[];
  budgetMaxMonthlySpendCents?: number;
  budgetAlertThresholdCents?: number;
};

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: WorkspaceSettings | null;
};
