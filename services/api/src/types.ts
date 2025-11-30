/**
 * Canonical types derived from database schema
 *
 * These are the source of truth for all data types in Wonder.
 * SDK and other packages should import from here to ensure consistency.
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import * as schema from './infrastructure/db/schema';

// Workspace & Project
export type Workspace = InferSelectModel<typeof schema.workspaces>;
export type NewWorkspace = InferInsertModel<typeof schema.workspaces>;

export type Project = InferSelectModel<typeof schema.projects>;
export type NewProject = InferInsertModel<typeof schema.projects>;

// Library
export type Library = InferSelectModel<typeof schema.libraries>;
export type NewLibrary = InferInsertModel<typeof schema.libraries>;

// Workflow Definitions
export type WorkflowDef = InferSelectModel<typeof schema.workflow_defs>;
export type NewWorkflowDef = InferInsertModel<typeof schema.workflow_defs>;

export type Workflow = InferSelectModel<typeof schema.workflows>;
export type NewWorkflow = InferInsertModel<typeof schema.workflows>;

// Graph Structure
export type Node = InferSelectModel<typeof schema.nodes>;
export type NewNode = InferInsertModel<typeof schema.nodes>;

export type Transition = InferSelectModel<typeof schema.transitions>;
export type NewTransition = InferInsertModel<typeof schema.transitions>;

// Actions
export type Action = InferSelectModel<typeof schema.actions>;
export type NewAction = InferInsertModel<typeof schema.actions>;

// AI Primitives
export type PromptSpec = InferSelectModel<typeof schema.prompt_specs>;
export type NewPromptSpec = InferInsertModel<typeof schema.prompt_specs>;

export type ModelProfile = InferSelectModel<typeof schema.model_profiles>;
export type NewModelProfile = InferInsertModel<typeof schema.model_profiles>;

// Workflow Runs
export type WorkflowRun = InferSelectModel<typeof schema.workflow_runs>;
export type NewWorkflowRun = InferInsertModel<typeof schema.workflow_runs>;

// Re-export schema for direct access if needed
export { schema };
