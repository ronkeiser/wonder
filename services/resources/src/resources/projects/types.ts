/** Type definitions for projects */

import { projects } from '../../schema';

/** ProjectSettings - parsed from project_settings table with undefined for missing values */
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

/** Project entity - base fields from schema plus joined settings */
export type Project = typeof projects.$inferSelect & {
  settings: ProjectSettings | null;
};
