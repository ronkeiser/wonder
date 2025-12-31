/** Types for Turn resource */

import type { turns } from '../../schema';

export type Turn = typeof turns.$inferSelect;
export type TurnStatus = 'active' | 'completed' | 'failed';
export type CallerType = 'user' | 'workflow' | 'agent';

export type TurnCaller =
  | { type: 'user'; userId: string }
  | { type: 'workflow'; runId: string }
  | { type: 'agent'; agentId: string; turnId: string };

export type TurnIssues = {
  memoryExtractionFailed?: boolean;
  toolFailures?: number;
};
