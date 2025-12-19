/** Type definitions for workflow definitions */

import { nodes, transitions, workflow_defs } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** WorkflowDef entity - inferred from database schema */
export type WorkflowDef = typeof workflow_defs.$inferSelect;

/** Node entity - inferred from database schema */
export type Node = typeof nodes.$inferSelect;

/** Transition entity - inferred from database schema */
export type Transition = typeof transitions.$inferSelect;
