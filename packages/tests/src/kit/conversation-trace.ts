/**
 * Conversation Trace Event Helpers
 *
 * Extends TraceEventCollection with conversation-specific semantic query methods.
 * Provides typed access to agent/conversation trace events.
 */

import type { TraceEventEntry } from '@wonder/sdk';
import { TraceEventCollection, type TypedTraceEvent } from './trace';

// =============================================================================
// Conversation Trace Payload Types
// =============================================================================

export namespace ConversationTracePayloads {
  // Turn operations
  export interface TurnCreated {
    turnId: string;
    conversationId: string;
    callerType: 'user' | 'workflow' | 'agent';
  }

  export interface TurnCompleted {
    turnId: string;
    from: string;
    issues: {
      memoryExtractionFailed?: boolean;
      toolFailures?: number;
    } | null;
  }

  export interface TurnFailed {
    turnId: string;
    from: string;
    errorCode: string;
    errorMessage: string;
  }

  export interface TurnContextAssemblyLinked {
    turnId: string;
    runId: string;
  }

  export interface TurnMemoryExtractionLinked {
    turnId: string;
    runId: string;
  }

  // Message operations
  export interface MessageAppended {
    messageId: string;
    conversationId: string;
    turnId: string;
    role: 'user' | 'agent';
    contentLength: number;
  }

  // Move operations
  export interface MoveRecorded {
    moveId: string;
    turnId: string;
    sequence: number;
    hasReasoning: boolean;
    hasToolCall: boolean;
  }

  export interface MoveResultRecorded {
    moveId: string;
    turnId: string;
    toolCallId: string;
    sequence: number;
  }

  // LLM loop operations
  export interface LLMCalling {
    turnId: string;
    messageCount: number;
    toolCount: number;
  }

  export interface LLMResponse {
    turnId: string;
    hasText: boolean;
    toolCallCount: number;
    stopReason: string;
  }

  // Context assembly
  export interface ContextAssemblyDispatched {
    turnId: string;
    workflowRunId: string;
    workflowId: string;
    recentTurnsCount: number;
    activeTurnsCount: number;
  }

  // Tool dispatch (from planning.response.tool_dispatch event)
  export interface ToolDispatched {
    turnId: string;
    toolCallId: string;
    toolName: string;
    targetType: string;
    targetId: string;
    async: boolean;
  }
}

// =============================================================================
// Conversation Trace Event Collection
// =============================================================================

/**
 * Extended trace event collection with conversation-specific semantic accessors.
 *
 * Provides ergonomic methods for querying agent/conversation trace events
 * in tests, mirroring the workflow trace collection patterns.
 */
export class ConversationTraceEventCollection extends TraceEventCollection {
  constructor(events: TraceEventEntry[]) {
    super(events);
  }

  /**
   * Filter events by turn ID
   */
  byTurn(turnId: string): TypedTraceEvent[] {
    return this.all().filter((e) => (e.payload as { turnId?: string }).turnId === turnId);
  }

  /**
   * Turn lifecycle operations
   */
  get turns() {
    const self = this;
    return {
      /** All turn creation events */
      starts(): TypedTraceEvent<ConversationTracePayloads.TurnCreated>[] {
        return self.filter<ConversationTracePayloads.TurnCreated>('operation.turns.created');
      },

      /** All turn completion events */
      completions(): TypedTraceEvent<ConversationTracePayloads.TurnCompleted>[] {
        return self.filter<ConversationTracePayloads.TurnCompleted>('operation.turns.completed');
      },

      /** All turn failure events */
      failures(): TypedTraceEvent<ConversationTracePayloads.TurnFailed>[] {
        return self.filter<ConversationTracePayloads.TurnFailed>('operation.turns.failed');
      },

      /** Get completion event for specific turn */
      completion(
        turnId: string,
      ): TypedTraceEvent<ConversationTracePayloads.TurnCompleted> | undefined {
        return self
          .filter<ConversationTracePayloads.TurnCompleted>('operation.turns.completed')
          .find((e) => e.payload.turnId === turnId);
      },

      /** Get failure event for specific turn */
      failure(turnId: string): TypedTraceEvent<ConversationTracePayloads.TurnFailed> | undefined {
        return self
          .filter<ConversationTracePayloads.TurnFailed>('operation.turns.failed')
          .find((e) => e.payload.turnId === turnId);
      },

      /** Get status transitions for a turn */
      statusTransitions(turnId: string): string[] {
        const statuses: string[] = ['active'];
        const completion = self
          .filter<ConversationTracePayloads.TurnCompleted>('operation.turns.completed')
          .find((e) => e.payload.turnId === turnId);
        const failure = self
          .filter<ConversationTracePayloads.TurnFailed>('operation.turns.failed')
          .find((e) => e.payload.turnId === turnId);
        if (completion) statuses.push('completed');
        if (failure) statuses.push('failed');
        return statuses;
      },

      /** Context assembly workflow link events */
      contextAssemblyLinks(): TypedTraceEvent<ConversationTracePayloads.TurnContextAssemblyLinked>[] {
        return self.filter<ConversationTracePayloads.TurnContextAssemblyLinked>(
          'operation.turns.context_assembly_linked',
        );
      },

      /** Memory extraction workflow link events */
      memoryExtractionLinks(): TypedTraceEvent<ConversationTracePayloads.TurnMemoryExtractionLinked>[] {
        return self.filter<ConversationTracePayloads.TurnMemoryExtractionLinked>(
          'operation.turns.memory_extraction_linked',
        );
      },
    };
  }

  /**
   * Message operations
   */
  get messages() {
    const self = this;
    return {
      /** All message appended events */
      all(): TypedTraceEvent<ConversationTracePayloads.MessageAppended>[] {
        return self.filter<ConversationTracePayloads.MessageAppended>(
          'operation.messages.appended',
        );
      },

      /** User message events */
      user(): TypedTraceEvent<ConversationTracePayloads.MessageAppended>[] {
        return self
          .filter<ConversationTracePayloads.MessageAppended>('operation.messages.appended')
          .filter((e) => e.payload.role === 'user');
      },

      /** Agent message events */
      agent(): TypedTraceEvent<ConversationTracePayloads.MessageAppended>[] {
        return self
          .filter<ConversationTracePayloads.MessageAppended>('operation.messages.appended')
          .filter((e) => e.payload.role === 'agent');
      },

      /** Messages for specific turn */
      forTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.MessageAppended>[] {
        return self
          .filter<ConversationTracePayloads.MessageAppended>('operation.messages.appended')
          .filter((e) => e.payload.turnId === turnId);
      },
    };
  }

  /**
   * Move operations (LLM iterations within a turn)
   */
  get moves() {
    const self = this;
    return {
      /** All move recorded events */
      all(): TypedTraceEvent<ConversationTracePayloads.MoveRecorded>[] {
        return self.filter<ConversationTracePayloads.MoveRecorded>('operation.moves.recorded');
      },

      /** Moves for specific turn */
      forTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.MoveRecorded>[] {
        return self
          .filter<ConversationTracePayloads.MoveRecorded>('operation.moves.recorded')
          .filter((e) => e.payload.turnId === turnId);
      },

      /** All tool result recorded events */
      results(): TypedTraceEvent<ConversationTracePayloads.MoveResultRecorded>[] {
        return self.filter<ConversationTracePayloads.MoveResultRecorded>(
          'operation.moves.result_recorded',
        );
      },

      /** Tool results for specific turn */
      resultsForTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.MoveResultRecorded>[] {
        return self
          .filter<ConversationTracePayloads.MoveResultRecorded>('operation.moves.result_recorded')
          .filter((e) => e.payload.turnId === turnId);
      },
    };
  }

  /**
   * LLM call operations
   */
  get llm() {
    const self = this;
    return {
      /** All LLM calling events */
      calls(): TypedTraceEvent<ConversationTracePayloads.LLMCalling>[] {
        return self.filter<ConversationTracePayloads.LLMCalling>('loop.llm.calling');
      },

      /** All LLM response events */
      responses(): TypedTraceEvent<ConversationTracePayloads.LLMResponse>[] {
        return self.filter<ConversationTracePayloads.LLMResponse>('loop.llm.response');
      },

      /** LLM calls for specific turn */
      callsForTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.LLMCalling>[] {
        return self
          .filter<ConversationTracePayloads.LLMCalling>('loop.llm.calling')
          .filter((e) => e.payload.turnId === turnId);
      },

      /** LLM responses for specific turn */
      responsesForTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.LLMResponse>[] {
        return self
          .filter<ConversationTracePayloads.LLMResponse>('loop.llm.response')
          .filter((e) => e.payload.turnId === turnId);
      },
    };
  }

  /**
   * Context assembly operations
   */
  get contextAssembly() {
    const self = this;
    return {
      /** All context assembly dispatch events */
      dispatches(): TypedTraceEvent<ConversationTracePayloads.ContextAssemblyDispatched>[] {
        return self.filter<ConversationTracePayloads.ContextAssemblyDispatched>(
          'loop.context_assembly.dispatched',
        );
      },

      /** Context assembly for specific turn */
      forTurn(
        turnId: string,
      ): TypedTraceEvent<ConversationTracePayloads.ContextAssemblyDispatched>[] {
        return self
          .filter<ConversationTracePayloads.ContextAssemblyDispatched>(
            'loop.context_assembly.dispatched',
          )
          .filter((e) => e.payload.turnId === turnId);
      },
    };
  }

  /**
   * Tool dispatch operations
   */
  get tools() {
    const self = this;
    return {
      /** All tool dispatch events */
      dispatches(): TypedTraceEvent<ConversationTracePayloads.ToolDispatched>[] {
        return self.filter<ConversationTracePayloads.ToolDispatched>('planning.response.tool_dispatch');
      },

      /** Sync tool dispatches */
      syncDispatches(): TypedTraceEvent<ConversationTracePayloads.ToolDispatched>[] {
        return self
          .filter<ConversationTracePayloads.ToolDispatched>('planning.response.tool_dispatch')
          .filter((e) => !e.payload.async);
      },

      /** Async tool dispatches */
      asyncDispatches(): TypedTraceEvent<ConversationTracePayloads.ToolDispatched>[] {
        return self
          .filter<ConversationTracePayloads.ToolDispatched>('planning.response.tool_dispatch')
          .filter((e) => e.payload.async);
      },

      /** Tool dispatches for specific turn */
      forTurn(turnId: string): TypedTraceEvent<ConversationTracePayloads.ToolDispatched>[] {
        return self
          .filter<ConversationTracePayloads.ToolDispatched>('planning.response.tool_dispatch')
          .filter((e) => e.payload.turnId === turnId);
      },
    };
  }

  /**
   * Error tracking
   */
  get errors() {
    const self = this;
    return {
      /** All error events */
      all(): TypedTraceEvent[] {
        return self.all().filter((e) => e.type.includes('error') || e.type.includes('failed'));
      },

      /** Error count */
      count(): number {
        return this.all().length;
      },
    };
  }
}
