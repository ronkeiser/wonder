/** Type definitions for workflows */

import { workflow_runs, workflows } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Workflow entity - inferred from database schema */
export type Workflow = typeof workflows.$inferSelect;

/** WorkflowRun entity - inferred from database schema */
export type WorkflowRun = typeof workflow_runs.$inferSelect;
