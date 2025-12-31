/**
 * Wonder Agent Service
 *
 * Durable Object-based conversation orchestration service.
 * Manages agent conversations and tool execution via RPC.
 *
 * Each Conversation instance manages a single conversation, following
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
  ParticipantManager,
  TurnManager,
} from './operations';
import type {
  AgentCallback,
  AgentCallParams,
  Caller,
  LLMRequest,
  ToolResult,
  TurnIssues,
  WorkflowCallback,
} from './types';

/**
 * Conversation Durable Object
 *
 * Each instance manages a single conversation.
 */
export class Conversation extends DurableObject {
  private defs: DefinitionManager;
  private emitter: Emitter;
  private logger: Logger;
  private turns: TurnManager;
  private messages: MessageManager;
  private moves: MoveManager;
  private asyncOps: AsyncOpManager;
  private participants: ParticipantManager;

  /** Active WebSocket connection for streaming LLM tokens */
  private activeWebSocket: WebSocket | null = null;

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
    this.participants = new ParticipantManager(db, this.emitter);
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
      participants: this.participants,
      emitter: this.emitter,
      conversationId: conversation.id,
      coordinator: this.env.COORDINATOR,
      executor: this.env.EXECUTOR,
      agent: this.env.AGENT,
      resources: this.env.RESOURCES,
      env: this.env,
      waitUntil: (promise) => this.ctx.waitUntil(promise),
      scheduleAlarm: async (timeoutAt: number) => {
        // Only schedule if this timeout is earlier than the current alarm
        const currentAlarm = await this.ctx.storage.getAlarm();
        if (currentAlarm === null || timeoutAt < currentAlarm) {
          await this.ctx.storage.setAlarm(timeoutAt);
        }
      },
      streamToken: this.activeWebSocket
        ? (token: string) => this.activeWebSocket?.send(JSON.stringify({ type: 'token', token }))
        : undefined,
    };
  }

  /**
   * Handle HTTP requests to the Conversation DO.
   *
   * Supports WebSocket upgrade for real-time LLM token streaming.
   */
  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade for streaming
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.handleWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle WebSocket connection for streaming.
   */
  private handleWebSocket(ws: WebSocket): void {
    this.activeWebSocket = ws;

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          conversationId?: string;
          input?: unknown;
          caller?: Caller;
        };

        if (data.type === 'start_turn' && data.conversationId && data.caller) {
          const result = await this.startTurn(data.conversationId, data.input, data.caller);
          ws.send(JSON.stringify({ type: 'turn_started', turnId: result.turnId }));
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    });

    ws.addEventListener('close', () => {
      this.activeWebSocket = null;
    });

    ws.addEventListener('error', () => {
      this.activeWebSocket = null;
    });
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
    const moves = this.moves.getForTurn(turnId);

    if (persona?.memoryExtractionWorkflowId) {
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

    // Count tool failures for turn issues tracking
    const toolFailures = moves.filter((m) => {
      const result = m.toolResult as { success?: boolean } | null;
      return result !== null && result.success === false;
    }).length;

    // Build turn issues
    const issues: TurnIssues | undefined = toolFailures > 0 ? { toolFailures } : undefined;

    // Mark turn complete with issues
    this.turns.complete(turnId, issues);

    this.logger.info({
      eventType: 'conversation.turn.completed',
      message: 'Turn completed',
      traceId: ctx.conversationId,
      metadata: { turnId },
    });

    // Check for callbacks (agent delegation or workflow-initiated)
    const turn = this.turns.get(turnId);
    const inputWithCallbacks = turn?.input as {
      _agentCallback?: AgentCallback;
      _workflowCallback?: WorkflowCallback;
    } | null;

    // Extract final response from moves (last reasoning text)
    const lastMoveWithReasoning = [...moves].reverse().find((m) => m.reasoning);
    const response = lastMoveWithReasoning?.reasoning ?? '';

    // Handle agent callback (delegate mode completion)
    const agentCallback = inputWithCallbacks?._agentCallback;
    if (agentCallback) {
      const parentAgentId = ctx.agent.idFromName(agentCallback.conversationId);
      const parentAgent = ctx.agent.get(parentAgentId);

      this.logger.info({
        eventType: 'conversation.turn.agent_callback',
        message: 'Calling back to parent agent',
        traceId: ctx.conversationId,
        metadata: {
          turnId,
          parentConversationId: agentCallback.conversationId,
          parentTurnId: agentCallback.turnId,
          toolCallId: agentCallback.toolCallId,
        },
      });

      ctx.waitUntil(
        parentAgent
          .handleAgentResponse(agentCallback.turnId, agentCallback.toolCallId, response)
          .catch((error: Error) => {
            this.logger.error({
              eventType: 'conversation.turn.agent_callback_failed',
              message: 'Failed to call back to parent agent',
              traceId: ctx.conversationId,
              metadata: {
                turnId,
                parentConversationId: agentCallback.conversationId,
                error: error.message,
              },
            });
          }),
      );
    }

    // Handle workflow callback (workflow-initiated agent call completion)
    const workflowCallback = inputWithCallbacks?._workflowCallback;
    if (workflowCallback?.type === 'workflow') {
      const coordinatorId = ctx.coordinator.idFromName(workflowCallback.runId);
      const coordinator = ctx.coordinator.get(coordinatorId);

      this.logger.info({
        eventType: 'conversation.turn.workflow_callback',
        message: 'Calling back to parent coordinator',
        traceId: ctx.conversationId,
        metadata: {
          turnId,
          runId: workflowCallback.runId,
          nodeId: workflowCallback.nodeId,
        },
      });

      ctx.waitUntil(
        coordinator
          .handleAgentResult(workflowCallback.nodeId, { response })
          .catch((error: Error) => {
            this.logger.error({
              eventType: 'conversation.turn.workflow_callback_failed',
              message: 'Failed to call back to parent coordinator',
              traceId: ctx.conversationId,
              metadata: {
                turnId,
                runId: workflowCallback.runId,
                error: error.message,
              },
            });
          }),
      );
    }
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
    // Build conversation history in Anthropic format:
    // 1. User message
    // 2. For each LLM response with tool_use: assistant message + tool_result
    // 3. New tool_result for this completion

    type AnthropicMessage = {
      role: 'user' | 'assistant';
      content: string | unknown[];
    };

    const messages: AnthropicMessage[] = [];

    // Get the user message for this turn
    const turnMessages = this.messages.getForTurn(turnId);
    const userMessage = turnMessages.find((m) => m.role === 'user');
    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage.content,
      });
    }

    // Get all moves for this turn to reconstruct the conversation
    const moves = this.moves.getForTurn(turnId);

    for (const move of moves) {
      // If this move has raw content (assistant response with tool_use), add it
      if (move.rawContent) {
        messages.push({
          role: 'assistant',
          content: move.rawContent as unknown[],
        });

        // If this move has a tool result, add it as user message with tool_result block
        if (move.toolResult !== null) {
          const toolResultContent = move.toolResult as { success: boolean; result?: unknown; error?: { message: string } };
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: move.toolCallId,
              content: toolResultContent.success
                ? (typeof toolResultContent.result === 'string'
                    ? toolResultContent.result
                    : JSON.stringify(toolResultContent.result))
                : `Error: ${toolResultContent.error?.message ?? 'Unknown error'}`,
              is_error: !toolResultContent.success,
            }],
          });
        }
      }
    }

    // Add the new tool result for the completing tool
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolCallId,
        content: result.success
          ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
          : `Error: ${result.error?.message ?? 'Unknown error'}`,
        is_error: !result.success,
      }],
    });

    // Get persona for model settings
    const persona = this.defs.getPersona();

    return {
      messages,
      systemPrompt: persona?.systemPrompt,
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
   * Start an agent call from a workflow node or another agent.
   *
   * Unlike startTurn (user-initiated via WebSocket), this:
   * - Doesn't stream to WebSocket
   * - Callbacks to parent coordinator/agent when complete
   * - May inherit branch context from parent workflow
   *
   * @param params - Agent call parameters including callback info
   */
  async startAgentCall(params: AgentCallParams): Promise<{ turnId: string }> {
    try {
      // Initialize definitions (loads from D1 on first call, cached thereafter)
      await this.defs.initializeConversation(params.conversationId);

      this.logger.info({
        eventType: 'conversation.agent_call.starting',
        message: 'Starting agent call',
        traceId: params.conversationId,
        metadata: {
          callerType: params.caller.type,
          hasCallback: !!params.callback,
          hasBranchContext: !!params.branchContext,
        },
      });

      // Embed callback metadata in input for later retrieval
      const inputWithCallback = params.callback
        ? { ...(params.input as object), _workflowCallback: params.callback }
        : params.input;

      // Create the turn
      const turnId = this.turns.create({
        conversationId: params.conversationId,
        caller: params.caller,
        input: inputWithCallback,
      });

      this.logger.info({
        eventType: 'conversation.agent_call.turn_created',
        message: 'Agent call turn created',
        traceId: params.conversationId,
        metadata: { turnId },
      });

      // Append input as message
      const userMessage = typeof params.input === 'string'
        ? params.input
        : JSON.stringify(params.input);
      this.messages.append({
        conversationId: params.conversationId,
        turnId,
        role: 'user',
        content: userMessage,
      });

      // Get dispatch context (no streaming for agent calls - activeWebSocket is null)
      const ctx = this.getDispatchContext();

      // Dispatch context assembly workflow
      await dispatchContextAssembly(turnId, userMessage, this.defs, ctx);

      this.logger.info({
        eventType: 'conversation.agent_call.context_assembly_dispatched',
        message: 'Context assembly dispatched for agent call',
        traceId: params.conversationId,
        metadata: { turnId },
      });

      return { turnId };
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.agent_call.failed',
        message: 'Failed to start agent call',
        traceId: params.conversationId,
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
   * Handle task error from Executor.
   *
   * Called when a task dispatched by a tool fails.
   */
  async handleTaskError(turnId: string, toolCallId: string, error: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.task_error.turn_not_found',
          message: 'Turn not found for task error',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.task_error.received',
        message: 'Received task error',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId, error },
      });

      // Record the tool result as failure
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
        eventType: 'conversation.task_error.failed',
        message: 'Failed to handle task error',
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
   * Handle agent error from another ConversationDO.
   *
   * Called when an agent invoked by a tool fails (delegate mode).
   */
  async handleAgentError(turnId: string, toolCallId: string, error: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.agent_error.turn_not_found',
          message: 'Turn not found for agent error',
          metadata: { turnId, toolCallId },
        });
        return;
      }

      this.logger.info({
        eventType: 'conversation.agent_error.received',
        message: 'Received agent error',
        traceId: turn.conversationId,
        metadata: { turnId, toolCallId, error },
      });

      // Record the tool result as failure
      const result: ToolResult = {
        toolCallId,
        success: false,
        error: {
          code: 'AGENT_DECLINED',
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
        // Async agent failed - check if turn can complete now
        const loopResult: RunLLMLoopResult = {
          waitingForSync: false,
          pendingAsyncOps: this.asyncOps.getPendingCount(turnId),
        };
        await this.maybeCompleteTurn(turnId, loopResult, ctx);
      }
    } catch (err) {
      this.logger.error({
        eventType: 'conversation.agent_error.failed',
        message: 'Failed to handle agent error',
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

      // Memory extraction is fire-and-forget - turn was already completed
      // in maybeCompleteTurn before dispatching extraction.
      // This callback is just for bookkeeping/logging.
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

  /**
   * Handle memory extraction error.
   *
   * Called when the memory extraction workflow fails.
   * The turn is already completed - this just marks the extraction failure.
   */
  async handleMemoryExtractionError(turnId: string, runId: string, error: string): Promise<void> {
    try {
      const turn = this.turns.get(turnId);
      if (!turn) {
        this.logger.warn({
          eventType: 'conversation.memory_extraction_error.turn_not_found',
          message: 'Turn not found for memory extraction error',
          metadata: { turnId, runId },
        });
        return;
      }

      this.logger.warn({
        eventType: 'conversation.memory_extraction_error.received',
        message: 'Memory extraction failed',
        traceId: turn.conversationId,
        metadata: { turnId, runId, error },
      });

      // Mark the turn with memoryExtractionFailed flag
      // The turn is already complete - this updates the issues metadata
      this.turns.markMemoryExtractionFailed(turnId);
    } catch (err) {
      this.logger.error({
        eventType: 'conversation.memory_extraction_error.failed',
        message: 'Failed to handle memory extraction error',
        metadata: {
          turnId,
          runId,
          originalError: error,
          handlerError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Durable Object alarm handler for timeouts.
   *
   * Fires when the earliest pending async operation times out.
   * Marks the operation as failed and either resumes the LLM loop
   * (for sync operations) or checks turn completion (for async).
   */
  async alarm(): Promise<void> {
    try {
      const now = new Date();
      const timedOutOps = this.asyncOps.getTimedOut(now);

      this.logger.info({
        eventType: 'conversation.alarm.triggered',
        message: 'Alarm triggered for timeout check',
        metadata: {
          timedOutCount: timedOutOps.length,
        },
      });

      for (const op of timedOutOps) {
        this.logger.warn({
          eventType: 'conversation.alarm.operation_timeout',
          message: 'Async operation timed out',
          traceId: op.turnId,
          metadata: {
            opId: op.id,
            turnId: op.turnId,
            targetType: op.targetType,
            targetId: op.targetId,
          },
        });

        // Record the timeout as a tool failure
        const result: ToolResult = {
          toolCallId: op.id,
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Operation timed out after waiting`,
            retriable: true,
          },
        };
        this.moves.recordResult(op.turnId, op.id, result);

        // Mark async operation as failed
        this.asyncOps.fail(op.id, result.error);

        // Check if this was a waiting (sync) operation
        const wasWaiting = op.status === 'waiting';

        // Get dispatch context
        const ctx = this.getDispatchContext();

        if (wasWaiting) {
          // Resume from sync tool - continue LLM loop with timeout error
          const continuationRequest = this.buildContinuationRequest(op.turnId, op.id, result);

          const loopResult = await runLLMLoop({
            turnId: op.turnId,
            llmRequest: continuationRequest,
            defs: this.defs,
            ctx,
          });

          await this.maybeCompleteTurn(op.turnId, loopResult, ctx);
        } else {
          // Async op timed out - check if turn can complete now
          const loopResult: RunLLMLoopResult = {
            waitingForSync: false,
            pendingAsyncOps: this.asyncOps.getPendingCount(op.turnId),
          };
          await this.maybeCompleteTurn(op.turnId, loopResult, ctx);
        }
      }

      // Schedule next alarm if there are more pending operations with timeouts
      await this.scheduleNextAlarm();
    } catch (error) {
      this.logger.error({
        eventType: 'conversation.alarm.failed',
        message: 'Failed to handle alarm',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Schedule the next alarm for the earliest pending timeout.
   */
  private async scheduleNextAlarm(): Promise<void> {
    const earliestTimeout = this.asyncOps.getEarliestTimeout();

    if (earliestTimeout) {
      this.logger.info({
        eventType: 'conversation.alarm.scheduled',
        message: 'Scheduling next alarm',
        metadata: {
          timeoutAt: earliestTimeout.toISOString(),
        },
      });

      await this.ctx.storage.setAlarm(earliestTimeout.getTime());
    }
  }
}


/**
 * Worker entrypoint
 */
export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('OK');
  },
};
