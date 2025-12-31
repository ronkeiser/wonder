/**
 * Wonder Agent Service
 *
 * Durable Object-based conversation orchestration service.
 * Manages agent conversations and tool execution via RPC.
 *
 * Each ConversationDO instance manages a single conversation, following
 * the same actor/decision pattern as WorkflowCoordinator:
 * receive → decide → dispatch → wait → resume
 */
import { createEmitter, type Emitter } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';

import type { DispatchContext } from './dispatch/context';
import { applyDecisions } from './dispatch/apply';
import { dispatchContextAssembly, runLLMLoop, type RunLLMLoopResult } from './loop';
import { decideMemoryExtraction } from './planning';
import {
  AsyncOpManager,
  createDb,
  DefinitionManager,
  MessageManager,
  MoveManager,
  TurnManager,
} from './operations';
import type { Caller, LLMRequest, ToolResult } from './types';

/**
 * ConversationDO Durable Object
 *
 * Each instance manages a single conversation.
 */
export class ConversationDO extends DurableObject {
  private defs: DefinitionManager;
  private emitter: Emitter;
  private logger: Logger;
  private turns: TurnManager;
  private messages: MessageManager;
  private moves: MoveManager;
  private asyncOps: AsyncOpManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: this.env.SERVICE,
      environment: this.env.ENVIRONMENT,
    });

    // Create shared database instance
    const db = createDb(ctx);

    // Initialize DefinitionManager first (needs db, ctx for logger, env for resources)
    this.defs = new DefinitionManager(db, ctx, this.env);

    // Initialize emitter with lazy context (deferred until first emit)
    // Context comes from defs after initialize() is called
    this.emitter = createEmitter(
      this.env.STREAMER,
      () => {
        const conversation = this.defs.getConversation();
        const agent = this.defs.getAgent();
        return {
          streamId: conversation.id, // Conversations use their own ID as stream boundary
          executionId: conversation.id,
          executionType: 'conversation' as const,
          projectId: agent.projectIds[0], // Use first project from agent's scope
        };
      },
      { traceEnabled: false }, // TODO: Add trace events config
    );

    // All managers share the same db instance
    this.turns = new TurnManager(db, this.emitter);
    this.messages = new MessageManager(db, this.emitter);
    this.moves = new MoveManager(db, this.emitter);
    this.asyncOps = new AsyncOpManager(db, this.emitter);
  }

  /**
   * Build dispatch context for all operations.
   *
   * This bundles all dependencies needed by dispatch functions.
   */
  private getDispatchContext(): DispatchContext {
    const conversation = this.defs.getConversation();
    return {
      turns: this.turns,
      messages: this.messages,
      moves: this.moves,
      asyncOps: this.asyncOps,
      emitter: this.emitter,
      conversationId: conversation.id,
      coordinator: this.env.COORDINATOR,
      executor: this.env.EXECUTOR,
      agent: this.env.AGENT,
      resources: this.env.RESOURCES,
      waitUntil: (promise) => this.ctx.waitUntil(promise),
    };
  }

  /**
   * Check if turn should complete after LLM loop iteration.
   *
   * Turn completes when:
   * - Not waiting for sync tools
   * - No pending async operations
   *
   * When complete, dispatches memory extraction and marks turn done.
   */
  private async maybeCompleteTurn(
    turnId: string,
    loopResult: RunLLMLoopResult,
    ctx: DispatchContext,
  ): Promise<void> {
    // Still waiting for sync tool results
    if (loopResult.waitingForSync) {
      return;
    }

    // Still has pending async operations - turn stays active
    if (loopResult.pendingAsyncOps > 0) {
      return;
    }

    // All done - dispatch memory extraction
    const persona = this.defs.getPersona();
    const agent = this.defs.getAgent();
    if (persona?.memoryExtractionWorkflowId) {
      const moves = this.moves.getForTurn(turnId);
      const extractionDecisions = decideMemoryExtraction({
        turnId,
        agentId: agent.id,
        memoryExtractionWorkflowId: persona.memoryExtractionWorkflowId,
        transcript: moves.map((m) => ({
          sequence: m.sequence,
          reasoning: m.reasoning ?? undefined,
          toolCall: m.toolId
            ? { toolId: m.toolId, input: (m.toolInput as Record<string, unknown>) ?? {} }
            : undefined,
          toolResult: (m.toolResult as Record<string, unknown>) ?? undefined,
        })),
      });

      applyDecisions(extractionDecisions.decisions, ctx);
    }

    // Mark turn complete
    this.turns.complete(turnId);

    this.logger.info({
      eventType: 'conversation.turn.completed',
      message: 'Turn completed',
      traceId: ctx.conversationId,
      metadata: { turnId },
    });
  }

  /**
   * Build a continuation LLM request after a sync tool completes.
   *
   * Reconstructs the conversation including the tool result so the LLM
   * can continue reasoning.
   */
  private buildContinuationRequest(
    turnId: string,
    toolCallId: string,
    result: ToolResult,
  ): LLMRequest {
    // Get all messages for this turn
    const messages = this.messages.getForTurn(turnId);

    // Build the continuation with the tool result appended
    // The format depends on the LLM provider, but typically:
    // - Previous messages (user, assistant with tool_use)
    // - Tool result message
    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Append tool result as a tool_result message
    // This is a simplified format - actual implementation depends on provider
    formattedMessages.push({
      role: 'user' as const,
      content: JSON.stringify({
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: result.success
          ? JSON.stringify(result.result)
          : `Error: ${result.error?.message ?? 'Unknown error'}`,
        is_error: !result.success,
      }),
    });

    return {
      messages: formattedMessages,
    };
  }

  /**
   * Start a new turn in this conversation.
   *
   * Called when a user sends a message or when a workflow/agent invokes this agent.
   *
   * @param conversationId - The conversation ID (must match DO ID)
   * @param input - The input for this turn (user message or caller's input)
   * @param caller - Who initiated this turn
   */
  async startTurn(
    conversationId: string,
    input: unknown,
    caller: Caller,
  ): Promise<{ turnId: string }> {
    try {
      // Initialize definitions (loads from D1 on first call, cached thereafter)
      await this.defs.initializeConversation(conversationId);

      this.logger.info({
        eventType: 'conversation.turn.starting',
        message: 'Starting new turn',
        traceId: conversationId,
        metadata: {
          callerType: caller.type,
        },
      });

      // Create the turn
      const turnId = this.turns.create({
        conversationId,
        caller,
        input,
      });

      this.logger.info({
        eventType: 'conversation.turn.created',
        message: 'Turn created',
        traceId: conversationId,
        metadata: { turnId },
      });

      // Append user message
      const userMessage = typeof input === 'string' ? input : JSON.stringify(input);
      this.messages.append({
        conversationId,
        turnId,
        role: 'user',
        content: userMessage,
      });

      // Get dispatch context with service bindings
      const ctx = this.getDispatchContext();

      // Dispatch context assembly workflow
      // LLM loop runs when handleContextAssemblyResult callback is received
      await dispatchContextAssembly(turnId, userMessage, this.defs, ctx);

      this.logger.info({
        eventType: 'conversation.turn.context_assembly_dispatched',
        message: 'Context assembly dispatched, waiting for callback',
        traceId: conversationId,
        metadata: { turnId },
      });

      return { turnId };
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.turn.failed',
        message: 'Failed to start turn',
        traceId: conversationId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle task result from Executor.
   *
   * Called when a task dispatched by a tool completes.
   */
  async handleTaskResult(turnId: string, toolCallId: string, result: ToolResult): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.task_result.turn_not_found',
          message: 'Turn not found for task result',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.task_result.received',
        message: 'Received task result',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId, success: result.success },
      });

      // Record the tool result
      this.moves.recordResult(turnId, toolCallId, result);

      // Mark async operation as completed
      if (result.success) {
        this.asyncOps.complete(toolCallId, result.result);
      } else {
        this.asyncOps.fail(toolCallId, result.error);
      }

      // Check if this was a sync tool we were waiting for
      const wasWaiting = this.asyncOps.hasWaiting(turnId);

      // Get dispatch context
      const ctx = this.getDispatchContext();

      if (wasWaiting) {
        // Resume from sync tool - continue LLM loop with tool result
        // Build continuation request with tool result included
        const continuationRequest = this.buildContinuationRequest(turnId, toolCallId, result);

        const loopResult = await runLLMLoop({
          turnId,
          llmRequest: continuationRequest,
          defs: this.defs,
          ctx,
        });

        // Check if turn should complete
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      } else {
        // Async tool completed - check if turn can complete now
        const loopResult: RunLLMLoopResult = {
          waitingForSync: false,
          pendingAsyncOps: this.asyncOps.getPendingCount(turnId),
        };
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      }
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.task_result.failed',
        message: 'Failed to handle task result',
        metadata: {
          turnId,
          toolCallId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle workflow result from Coordinator.
   *
   * Called when a workflow dispatched by a tool completes.
   */
  async handleWorkflowResult(
    turnId: string,
    toolCallId: string,
    output: Record<string, unknown>,
  ): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.workflow_result.turn_not_found',
          message: 'Turn not found for workflow result',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.workflow_result.received',
        message: 'Received workflow result',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId },
      });

      // Record the tool result
      const result: ToolResult = {
        toolCallId,
        success: true,
        result: output,
      };
      this.moves.recordResult(turnId, toolCallId, result);

      // Mark async operation as completed
      this.asyncOps.complete(toolCallId, output);

      // Check if this was a sync tool we were waiting for
      const wasWaiting = this.asyncOps.hasWaiting(turnId);

      // Get dispatch context
      const ctx = this.getDispatchContext();

      if (wasWaiting) {
        // Resume from sync tool - continue LLM loop with tool result
        const continuationRequest = this.buildContinuationRequest(turnId, toolCallId, result);

        const loopResult = await runLLMLoop({
          turnId,
          llmRequest: continuationRequest,
          defs: this.defs,
          ctx,
        });

        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      } else {
        // Async tool completed - check if turn can complete now
        const loopResult: RunLLMLoopResult = {
          waitingForSync: false,
          pendingAsyncOps: this.asyncOps.getPendingCount(turnId),
        };
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      }
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.workflow_result.failed',
        message: 'Failed to handle workflow result',
        metadata: {
          turnId,
          toolCallId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle workflow error from Coordinator.
   *
   * Called when a workflow dispatched by a tool fails.
   */
  async handleWorkflowError(turnId: string, toolCallId: string, error: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.workflow_error.turn_not_found',
          message: 'Turn not found for workflow error',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.workflow_error.received',
        message: 'Received workflow error',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId, error },
      });

      // Record the tool result
      const result: ToolResult = {
        toolCallId,
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error,
          retriable: false,
        },
      };
      this.moves.recordResult(turnId, toolCallId, result);

      // Mark async operation as failed
      this.asyncOps.fail(toolCallId, result.error);

      // Check if this was a sync tool we were waiting for
      const wasWaiting = this.asyncOps.hasWaiting(turnId);

      // Get dispatch context
      const ctx = this.getDispatchContext();

      if (wasWaiting) {
        // Resume from sync tool - continue LLM loop with error result
        const continuationRequest = this.buildContinuationRequest(turnId, toolCallId, result);

        const loopResult = await runLLMLoop({
          turnId,
          llmRequest: continuationRequest,
          defs: this.defs,
          ctx,
        });

        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      } else {
        // Async tool failed - check if turn can complete now
        const loopResult: RunLLMLoopResult = {
          waitingForSync: false,
          pendingAsyncOps: this.asyncOps.getPendingCount(turnId),
        };
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      }
    } catch (err) {
      this.logger.error({
        eventType: 'conversation.workflow_error.failed',
        message: 'Failed to handle workflow error',
        metadata: {
          turnId,
          toolCallId,
          originalError: error,
          handlerError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Handle agent response from another ConversationDO.
   *
   * Called when an agent invoked by a tool responds (delegate mode).
   */
  async handleAgentResponse(turnId: string, toolCallId: string, response: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.agent_response.turn_not_found',
          message: 'Turn not found for agent response',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.agent_response.received',
        message: 'Received agent response',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId },
      });

      // Record the tool result
      const result: ToolResult = {
        toolCallId,
        success: true,
        result: { response },
      };
      this.moves.recordResult(turnId, toolCallId, result);

      // Mark async operation as completed
      this.asyncOps.complete(toolCallId, { response });

      // Check if this was a sync tool we were waiting for
      const wasWaiting = this.asyncOps.hasWaiting(turnId);

      // Get dispatch context
      const ctx = this.getDispatchContext();

      if (wasWaiting) {
        // Resume from sync tool - continue LLM loop with agent response
        const continuationRequest = this.buildContinuationRequest(turnId, toolCallId, result);

        const loopResult = await runLLMLoop({
          turnId,
          llmRequest: continuationRequest,
          defs: this.defs,
          ctx,
        });

        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      } else {
        // Async agent response - check if turn can complete now
        const loopResult: RunLLMLoopResult = {
          waitingForSync: false,
          pendingAsyncOps: this.asyncOps.getPendingCount(turnId),
        };
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      }
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.agent_response.failed',
        message: 'Failed to handle agent response',
        metadata: {
          turnId,
          toolCallId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle context assembly completion.
   *
   * Called when the context assembly workflow completes.
   * The context includes the provider-native LLM request.
   */
  async handleContextAssemblyResult(
    turnId: string,
    runId: string,
    context: { llmRequest: LLMRequest },
  ): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.context_assembly.turn_not_found',
          message: 'Turn not found for context assembly result',
          metadata: { turnId, runId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.context_assembly.completed',
        message: 'Context assembly completed',
        traceId: turn.conversationId,
        metadata: { turnId, runId },
      });

      // Link the workflow run to the turn (already linked in dispatchContextAssembly, but update if needed)
      this.turns.linkContextAssembly(turnId, runId);

      // Get dispatch context
      const ctx = this.getDispatchContext();

      // Run the LLM loop with the assembled context
      const loopResult = await runLLMLoop({
        turnId,
        llmRequest: context.llmRequest,
        defs: this.defs,
        ctx,
      });

      this.logger.info({
        eventType: 'conversation.llm_loop.completed',
        message: 'LLM loop iteration completed',
        traceId: turn.conversationId,
        metadata: {
          turnId,
          waitingForSync: loopResult.waitingForSync,
          pendingAsyncOps: loopResult.pendingAsyncOps,
        },
      });

      // Check if turn should complete
      await this.maybeCompleteTurn(turnId, loopResult, ctx);
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.context_assembly.failed',
        message: 'Failed to handle context assembly result',
        metadata: {
          turnId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Handle memory extraction completion.
   *
   * Called when the memory extraction workflow completes.
   */
  async handleMemoryExtractionResult(turnId: string, runId: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.memory_extraction.turn_not_found',
          message: 'Turn not found for memory extraction result',
          metadata: { turnId, runId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.memory_extraction.completed',
        message: 'Memory extraction completed',
        traceId: turn.conversationId,
        metadata: { turnId, runId },
      });

      // Link the workflow run to the turn
      this.turns.linkMemoryExtraction(turnId, runId);

      // TODO: Check if turn can be completed (all async ops done)
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.memory_extraction.failed',
        message: 'Failed to handle memory extraction result',
        metadata: {
          turnId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}

// Keep AgentDO as an alias for backwards compatibility with wrangler.jsonc
export { ConversationDO as AgentDO };

/**
 * Worker entrypoint
 */
export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('OK');
  },
};
