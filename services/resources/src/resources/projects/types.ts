/** Type definitions for projects */

export type ProjectSettings = {
  default_model_profile_id?: string;
  rate_limit_max_concurrent_runs?: number;
  rate_limit_max_llm_calls_per_hour?: number;
  budget_max_monthly_spend_cents?: number;
  budget_alert_threshold_cents?: number;
  snapshot_policy_every_n_events?: number;
  snapshot_policy_every_n_seconds?: number;
  snapshot_policy_on_fan_in_complete?: boolean;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  settings: ProjectSettings | null;
};
