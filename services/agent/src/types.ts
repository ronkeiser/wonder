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
// Pending Dispatch Types (for alarm-based trampolining)
// ============================================================================

/**
 * Pending dispatch for alarm-based execution.
 *
 * When a recursive call is received (from coordinator, parent agent, etc.),
 * we persist the request and set an immediate alarm rather than executing
 * synchronously. This breaks the subrequest depth chain.
 */
export type PendingDispatch =
  | {
      id: string;
      type: 'startTurn';
      payload: {
        id: string;
        content: string;
        caller: Caller;
        options?: { enableTraceEvents?: boolean };
      };
      createdAt: number;
    }
  | {
      id: string;
      type: 'handleAgentResponse';
      payload: { turnId: string; toolCallId: string; response: string };
      createdAt: number;
    }
  | {
      id: string;
      type: 'handleWorkflowResult';
      payload: { turnId: string; toolCallId: string; result: unknown };
      createdAt: number;
    }
  | {
      id: string;
      type: 'handleContextAssemblyResult';
      payload: { turnId: string; runId: string; context: { llmRequest: { messages: unknown[] } } };
      createdAt: number;
    }
  | {
      id: string;
      type: 'handleMemoryExtractionResult';
      payload: { turnId: string; runId: string };
      createdAt: number;
    };

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

/** Message for context assembly (uses our domain roles) */
export type LLMMessage = {
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
};

export type ContextAssemblyInput = {
  conversationId: string;
  userMessage: string;
  /** System prompt from persona */
  systemPrompt: string;
  /** Flat array of all messages from recent turns */
  messages: LLMMessage[];
  recentTurns: Turn[];
  modelProfileId: string;
  toolIds: string[];
  /** Resolved tool definitions for the persona */
  toolDefinitions: ToolDefinition[];
  /** Active turns with pending operations (for agent awareness of parallel work) */
  activeTurns?: ActiveTurnInfo[];
};

export type Message = {
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type Turn = {
  id: string;
  input: unknown;
  messages: Message[];
  moves: Move[];
  completedAt: string | null;
};

export type Move = {
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
  transcript: Move[];
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

  // Move recording (LLM iteration tracking)
  | {
      type: 'RECORD_MOVE';
      turnId: string;
      reasoning?: string;
      /** Raw content blocks from LLM response */
      rawContent?: unknown[];
    }

  // Tool dispatch
  | {
      type: 'DISPATCH_TASK';
      turnId: string;
      toolCallId: string;
      taskId: string;
      input: unknown;
      async: boolean;
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
      workflowDefId: string;
      workflowDefVersion: number;
      projectId: string;
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
