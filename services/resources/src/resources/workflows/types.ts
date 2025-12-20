/** Type definitions for workflows */

import { workflowRuns, workflows } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Workflow entity - inferred from database schema */
export type Workflow = typeof workflows.$inferSelect;

/** WorkflowRun entity - inferred from database schema */
export type WorkflowRun = typeof workflowRuns.$inferSelect;
