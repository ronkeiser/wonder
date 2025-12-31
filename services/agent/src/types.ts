/**
 * Agent Service Type Definitions
 *
 * Core types for agent operation:
 * - Domain types (TurnStatus, ConversationStatus)
 * - Caller: who initiated a turn
 * - ToolResult: result from tool execution
 * - AgentDecision: pure data describing state changes
 * - PlanningResult: decisions + trace events
 */

import type { TraceEventInput } from '@wonder/events';

// ============================================================================
// Domain Status Types
// ============================================================================

export type TurnStatus = 'active' | 'completed' | 'failed';

export type ConversationStatus = 'active' | 'waiting' | 'completed' | 'failed';

// ============================================================================
// Branch Context
// ============================================================================

/**
 * Branch context for shell operations.
 *
 * Each conversation operates on a dedicated git branch. When tools execute
 * shell commands, they run in the context of this branch.
 */
export type BranchContext = {
  /** Repository ID */
  repoId: string;
  /** Git branch name (e.g., "wonder/conv-{conversationId}") */
  branch: string;
};

// ============================================================================
// Participant Types
// ============================================================================

/**
 * Participant in a conversation - users or agents
 */
export type Participant =
  | { type: 'user'; userId: string }
  | { type: 'agent'; agentId: string };

// ============================================================================
// Caller Types
// ============================================================================

/**
 * Who initiated a turn - users, workflows, or other agents
 */
export type Caller =
  | { type: 'user'; userId: string }
  | { type: 'workflow'; runId: string }
  | { type: 'agent'; agentId: string; turnId: string };

// ============================================================================
// Tool Result Types
// ============================================================================

export type ToolErrorCode =
  | 'EXECUTION_FAILED'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT'
  | 'AGENT_DECLINED'
  | 'INTERNAL_ERROR';

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  retriable: boolean;
};

export type ToolResult = {
  toolCallId: string;
  success: boolean;
  result?: unknown;
  error?: ToolError;
};

// ============================================================================
// Turn Issues
// ============================================================================

export type TurnIssues = {
  memoryExtractionFailed?: boolean;
  toolFailures?: number;
};

// ============================================================================
// Turn Error
// ============================================================================

export type TurnError = {
  code: 'CONTEXT_ASSEMBLY_FAILED' | 'INTERNAL_ERROR';
  message: string;
};

// ============================================================================
// Context Assembly Input
// ============================================================================

/** Information about a pending async operation */
export type PendingOperationInfo = {
  type: 'task' | 'workflow' | 'agent';
  targetId: string;
  startedAt: string;
};

/** Information about an active turn for context awareness */
export type ActiveTurnInfo = {
  turnId: string;
  startedAt: string;
  pendingOperations: PendingOperationInfo[];
};

/** Tool definition passed to context assembly workflow */
export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  targetType: 'task' | 'workflow' | 'agent';
  async: boolean;
};

export type ContextAssemblyInput = {
  conversationId: string;
  userMessage: string;
  recentTurns: TurnSnapshot[];
  modelProfileId: string;
  toolIds: string[];
  /** Resolved tool definitions for the persona */
  toolDefinitions: ToolDefinition[];
  /** Active turns with pending operations (for agent awareness of parallel work) */
  activeTurns?: ActiveTurnInfo[];
};

export type TurnSnapshot = {
  id: string;
  input: unknown;
  moves: MoveSnapshot[];
  completedAt: string | null;
};

export type MoveSnapshot = {
  sequence: number;
  reasoning?: string;
  toolCall?: { toolId: string; input: Record<string, unknown> };
  toolResult?: Record<string, unknown>;
};

// ============================================================================
// Memory Extraction Input
// ============================================================================

export type MemoryExtractionInput = {
  agentId: string;
  turnId: string;
  transcript: MoveSnapshot[];
};

// ============================================================================
// LLM Request (output of context assembly workflow)
// ============================================================================

/**
 * Provider-native LLM request format.
 *
 * Context assembly workflow outputs this format directly.
 * The messages array is in the provider's native format (Anthropic, OpenAI, etc.)
 */
export type LLMRequest = {
  messages: unknown[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = 'user' | 'agent';

// ============================================================================
// Async Operation Types
// ============================================================================

export type AsyncOpStatus = 'pending' | 'waiting' | 'completed' | 'failed';

export type AsyncOpTargetType = 'task' | 'workflow' | 'agent';

// ============================================================================
// Planning Result
// ============================================================================

export type PlanningResult = {
  decisions: AgentDecision[];
  events: TraceEventInput[];
};

// ============================================================================
// Decision Types
// ============================================================================

/**
 * Decisions are pure data describing state changes.
 * Planning modules return Decision[], dispatch converts to operations.
 */
export type AgentDecision =
  // Turn lifecycle
  | { type: 'START_TURN'; conversationId: string; input?: object; caller: Caller }
  | { type: 'COMPLETE_TURN'; turnId: string; issues?: TurnIssues }
  | { type: 'FAIL_TURN'; turnId: string; error: TurnError }

  // Messages
  | { type: 'APPEND_MESSAGE'; turnId: string; role: 'user' | 'agent'; content: string }

  // Tool dispatch
  | {
      type: 'DISPATCH_TASK';
      turnId: string;
      toolCallId: string;
      taskId: string;
      input: unknown;
      /** Raw content blocks from LLM response (for tool continuation) */
      rawContent?: unknown[];
      /** Retry configuration for infrastructure errors */
      retry?: { maxAttempts: number; backoffMs: number };
    }
  | {
      type: 'DISPATCH_WORKFLOW';
      turnId: string;
      toolCallId: string;
      workflowId: string;
      input: unknown;
      async: boolean;
      /** Raw content blocks from LLM response (for tool continuation) */
      rawContent?: unknown[];
      /** Retry configuration for infrastructure errors */
      retry?: { maxAttempts: number; backoffMs: number };
    }
  | {
      type: 'DISPATCH_AGENT';
      turnId: string;
      toolCallId: string;
      agentId: string;
      input: unknown;
      mode: 'delegate' | 'loop_in';
      async: boolean;
      /** Raw content blocks from LLM response (for tool continuation) */
      rawContent?: unknown[];
      /** Retry configuration for infrastructure errors */
      retry?: { maxAttempts: number; backoffMs: number };
    }

  // Async tracking
  | {
      type: 'TRACK_ASYNC_OP';
      turnId: string;
      operationId: string;
      targetType: 'task' | 'workflow' | 'agent';
    }
  | {
      type: 'ASYNC_OP_COMPLETED';
      turnId: string;
      operationId: string;
      result: ToolResult;
    }

  // Sync tool waiting
  | { type: 'MARK_WAITING'; turnId: string; operationId: string }
  | { type: 'RESUME_FROM_TOOL'; turnId: string; operationId: string; result: unknown }

  // Context assembly / memory extraction workflow dispatch
  | {
      type: 'DISPATCH_CONTEXT_ASSEMBLY';
      turnId: string;
      workflowId: string;
      input: ContextAssemblyInput;
    }
  | {
      type: 'DISPATCH_MEMORY_EXTRACTION';
      turnId: string;
      workflowId: string;
      input: MemoryExtractionInput;
    };

// ============================================================================
// Agent Callback Type (for delegate mode agent invocation)
// ============================================================================

/**
 * Callback metadata for agent-to-agent delegation.
 * Embedded in target agent's input to enable callback on completion.
 */
export type AgentCallback = {
  /** The calling agent's conversation ID */
  conversationId: string;
  /** The calling agent's turn ID */
  turnId: string;
  /** The tool call ID to report result back to */
  toolCallId: string;
};

// ============================================================================
// Workflow Callback Type (for workflow-initiated agent calls)
// ============================================================================

/**
 * Callback metadata for workflow-initiated agent calls.
 * Embedded in agent's input to enable callback to parent coordinator.
 */
export type WorkflowCallback = {
  type: 'workflow';
  /** The workflow run ID */
  runId: string;
  /** The node ID that invoked the agent */
  nodeId: string;
};

// ============================================================================
// Agent Call Params (for startAgentCall)
// ============================================================================

/**
 * Parameters for workflow-initiated agent calls.
 *
 * Unlike startTurn (user-initiated via WebSocket), startAgentCall:
 * - Doesn't stream to WebSocket
 * - Callbacks to parent coordinator/agent when complete
 * - May inherit branch context from parent workflow
 */
export type AgentCallParams = {
  /** The conversation ID to use (or create) */
  conversationId: string;
  /** The input for this turn */
  input: unknown;
  /** Who initiated this call */
  caller: Caller;
  /** Optional callback for when turn completes */
  callback?: WorkflowCallback | AgentCallback;
  /** Optional branch context from parent workflow (for shell operations) */
  branchContext?: BranchContext;
};
