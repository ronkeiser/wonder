/** Type definitions for workflow definitions */

import { nodes, transitions, workflowDefs } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** WorkflowDef entity - inferred from database schema */
export type WorkflowDef = typeof workflowDefs.$inferSelect;

/** Node entity - inferred from database schema */
export type Node = typeof nodes.$inferSelect;

/** Transition entity - inferred from database schema */
export type Transition = typeof transitions.$inferSelect;
