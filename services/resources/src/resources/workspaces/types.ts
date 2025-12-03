/** Type definitions for workspaces */

export type WorkspaceSettings = {
  allowed_model_providers?: string[];
  allowed_mcp_servers?: string[];
  budget_max_monthly_spend_cents?: number;
  budget_alert_threshold_cents?: number;
};

export type Workspace = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: WorkspaceSettings | null;
};
