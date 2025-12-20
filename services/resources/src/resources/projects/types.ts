/** Type definitions for projects */

export type ProjectSettings = {
  defaultModelProfileId?: string;
  rateLimitMaxConcurrentRuns?: number;
  rateLimitMaxLlmCallsPerHour?: number;
  budgetMaxMonthlySpendCents?: number;
  budgetAlertThresholdCents?: number;
  snapshotPolicyEveryNEvents?: number;
  snapshotPolicyEveryNSeconds?: number;
  snapshotPolicyOnFanInComplete?: boolean;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings | null;
};
