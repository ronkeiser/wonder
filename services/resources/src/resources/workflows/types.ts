/** Type definitions for workflows */

import { workflowRuns, workflows } from '../../schema';
import type { NewEntity } from '~/shared/types';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** Workflow entity - inferred from database schema */
export type Workflow = typeof workflows.$inferSelect;

/** WorkflowRun entity - inferred from database schema */
export type WorkflowRun = typeof workflowRuns.$inferSelect;

/** Input for creating a workflow - inferred from schema */
export type WorkflowInput = NewEntity<typeof workflows.$inferInsert>;

/** Input for updating a workflow - partial of insert fields */
export type WorkflowUpdate = Partial<Pick<WorkflowInput, 'name' | 'description' | 'pinnedVersion' | 'enabled'>>;
