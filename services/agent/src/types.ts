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

export type ContextAssemblyInput = {
  conversationId: string;
  userMessage: string;
  recentTurns: TurnSnapshot[];
  modelProfileId: string;
  toolIds: string[];
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
  | { type: 'START_TURN'; conversationId: string; input: unknown; caller: Caller }
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
    }
  | {
      type: 'DISPATCH_WORKFLOW';
      turnId: string;
      toolCallId: string;
      workflowId: string;
      input: unknown;
      async: boolean;
    }
  | {
      type: 'DISPATCH_AGENT';
      turnId: string;
      toolCallId: string;
      agentId: string;
      input: unknown;
      mode: 'delegate' | 'loop_in';
      async: boolean;
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
