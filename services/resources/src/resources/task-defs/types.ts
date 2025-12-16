/** Type definitions for task definitions */

import type { RetryConfig, Step } from '../../schema';

/** Re-export Step for consumers */
export type { RetryConfig, Step };

export type TaskDef = {
  id: string;
  version: number;
  name: string;
  description: string;
  project_id: string | null;
  library_id: string | null;
  tags: string[] | null;
  input_schema: object;
  output_schema: object;
  steps: Step[];
  retry: RetryConfig | null;
  timeout_ms: number | null;
  created_at: string;
  updated_at: string;
};
