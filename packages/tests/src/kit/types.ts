/**
 * Kit Types
 *
 * All type definitions for the test kit.
 */

import type { EventEntry, TraceEventEntry } from '@wonder/sdk';
import type { TraceEventCollection } from './trace';

// =============================================================================
// Context Types
// =============================================================================

export interface TestContext {
  workspaceId: string;
  projectId: string;
  modelProfileId: string;
  /** Model profile reference (for persona creation) */
  modelProfileRef: string;
}

// =============================================================================
// Resource Types
// =============================================================================

/**
 * Tracks IDs of created resources for cleanup
 */
export interface CreatedResources {
  promptSpecIds: string[];
  actionIds: string[];
  taskIds: string[];
}

// =============================================================================
// Cleanup Types
// =============================================================================

export interface Deletable {
  delete: () => Promise<unknown>;
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface WorkflowTestSetup extends TestContext {
  workflowDefId: string;
  /** Workflow def reference (for persona creation) */
  workflowDefRef: string;
  workflowId: string;
  /** IDs of all created resources for cleanup (in creation order) */
  createdResources: CreatedResources;
}

/**
 * Result from executing a workflow
 */
export interface ExecuteWorkflowResult {
  workflowRunId: string;
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: EventEntry[];
  traceEvents: TraceEventEntry[];
  trace: TraceEventCollection;
}

/**
 * Result from runTestWorkflow
 */
export interface TestWorkflowResult {
  /** Results from executing the workflow */
  result: ExecuteWorkflowResult;
  /** The setup object with IDs of created resources */
  setup: WorkflowTestSetup;
  /** Cleanup function - call this when done */
  cleanup: () => Promise<void>;
}

// =============================================================================
// Conversation Types
// =============================================================================

import type { ConversationTraceEventCollection } from './conversation-trace';

/**
 * Tracks IDs of created conversation resources for cleanup
 */
export interface CreatedConversationResources {
  personaId?: string;
  agentId?: string;
  toolIds: string[];
  taskIds: string[];
  workflowIds: string[];
}

export interface ConversationTestSetup extends TestContext {
  agentId: string;
  personaId: string;
  conversationId: string;
  /** IDs of all created resources for cleanup (in creation order) */
  createdResources: CreatedConversationResources;
}

/**
 * Result from executing a conversation turn
 */
export interface ExecuteConversationResult {
  conversationId: string;
  turnIds: string[];
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: EventEntry[];
  traceEvents: TraceEventEntry[];
  trace: ConversationTraceEventCollection;
}

/**
 * Result from runTestConversation
 */
export interface TestConversationResult {
  /** Results from executing the conversation */
  result: ExecuteConversationResult;
  /** The setup object with IDs of created resources */
  setup: ConversationTestSetup;
  /** Cleanup function - call this when done */
  cleanup: () => Promise<void>;
}
