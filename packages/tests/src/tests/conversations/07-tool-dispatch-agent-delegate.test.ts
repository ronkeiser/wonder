/**
 * Conversation Test 07: Tool Dispatch to Agent (Delegate Mode)
 *
 * Validates sync tool dispatch to another agent in delegate mode:
 * 1. Manager agent receives user message requesting action
 * 2. LLM decides to invoke a tool (targetType: 'agent', mode: 'delegate')
 * 3. Tool dispatch to child agent's ConversationRunner (DO-to-DO)
 * 4. Manager agent waits for child agent's response
 * 5. Child agent executes in isolated context (no conversation history)
 * 6. Child agent's response flows back as tool result
 * 7. Manager agent continues reasoning with result
 * 8. Manager agent responds with final message
 *
 * Key behaviors being tested:
 * - Agent-to-agent dispatch via ConversationRunner
 * - Delegate mode: child agent sees only explicit input, no conversation history
 * - Child agent creates its own conversation (not joined to parent)
 * - Result flows back via handleAgentResponse callback
 *
 * Key difference from test 06 (workflow dispatch):
 * - Tool targets an agent, not a workflow
 * - Child agent runs its own turn with LLM reasoning
 * - Callback is agent.handleAgentResponse, not coordinator callback
 */

import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertConversationInvariants } from '~/kit';
import { setupTestContext } from '~/kit/context';
import { cleanupConversationTest, executeConversation } from '~/kit/conversation';
import { ConversationTraceEventCollection } from '~/kit/conversation-trace';
import { wonder } from '~/client';
import { createWorkflow } from '~/kit/workflow';
import {
  action as actionBuilder,
  node as nodeBuilder,
  step as stepBuilder,
  task as taskBuilder,
  workflow as workflowBuilder,
} from '@wonder/sdk';

describe('Conversation: 07 - Tool Dispatch to Agent (Delegate Mode)', () => {
  it('dispatches sync tool to agent in delegate mode, waits for response, resumes with result', async () => {
    // =========================================================================
    // SETUP: Create test infrastructure
    // =========================================================================
    console.log('Setting up test project...');
    const ctx = await setupTestContext();

    const createdResources = {
      toolIds: [] as string[],
      taskIds: [] as string[],
      workflowIds: [] as string[],
      actionIds: [] as string[],
      promptSpecIds: [] as string[],
      personaIds: [] as string[],
      agentIds: [] as string[],
    };

    try {
      // =========================================================================
      // SETUP: Create passthrough workflows for context assembly and memory extraction
      // These will be shared by both the manager and reviewer agents
      // =========================================================================

      // --- Context Assembly Passthrough (for manager) ---
      console.log('Creating context assembly passthrough workflow for manager...');
      const managerSystemPrompt =
        'You are a manager agent. When the user asks you to review something, delegate the review to your reviewer using the ask_reviewer tool. After receiving the review, summarize the feedback for the user.';

      const managerContextAction = actionBuilder({
        name: 'Build Manager LLM Request',
        description: 'Builds minimal LLM request for manager agent',
        kind: 'context',
        implementation: {},
      });

      const managerBuildRequestStep = stepBuilder({
        ref: 'build_request',
        ordinal: 0,
        action: managerContextAction,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${managerSystemPrompt.replace(/'/g, "\\'")}' }`,
        },
      });

      const messageSchema = s.object({
        role: s.string(),
        content: s.string(),
      });

      const llmRequestSchema = s.object({
        messages: s.array(messageSchema),
        systemPrompt: s.string(),
      });

      const managerBuildRequestTask = taskBuilder({
        name: 'Manager Context Assembly Passthrough',
        description: 'Builds LLM request for manager agent',
        inputSchema: s.object({
          userMessage: s.string(),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        steps: [managerBuildRequestStep],
      });

      const managerBuildRequestNode = nodeBuilder({
        ref: 'build_request',
        name: 'Build Request',
        task: managerBuildRequestTask,
        taskVersion: 1,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': 'result.llmRequest',
        },
      });

      const managerContextAssemblyWorkflow = workflowBuilder({
        name: 'Manager Context Assembly Passthrough',
        description: 'Test passthrough for manager context assembly',
        inputSchema: s.object({
          conversationId: s.string(),
          userMessage: s.string(),
          recentTurns: s.array(s.object({})),
          modelProfileId: s.string(),
          toolIds: s.array(s.string()),
          toolDefinitions: s.array(s.object({})),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        outputMapping: {
          llmRequest: 'output.llmRequest',
        },
        initialNodeRef: 'build_request',
        nodes: [managerBuildRequestNode],
        transitions: [],
      });

      const managerContextAssemblySetup = await createWorkflow(ctx, managerContextAssemblyWorkflow);
      createdResources.workflowIds.push(managerContextAssemblySetup.workflowId);
      createdResources.taskIds.push(...managerContextAssemblySetup.createdResources.taskIds);
      createdResources.actionIds.push(...managerContextAssemblySetup.createdResources.actionIds);

      // --- Context Assembly Passthrough (for reviewer) ---
      console.log('Creating context assembly passthrough workflow for reviewer...');
      const reviewerSystemPrompt =
        'You are a code reviewer. When given code to review, provide brief, constructive feedback. Focus on clarity, correctness, and best practices. Be concise.';

      const reviewerContextAction = actionBuilder({
        name: 'Build Reviewer LLM Request',
        description: 'Builds minimal LLM request for reviewer agent',
        kind: 'context',
        implementation: {},
      });

      const reviewerBuildRequestStep = stepBuilder({
        ref: 'build_request',
        ordinal: 0,
        action: reviewerContextAction,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${reviewerSystemPrompt.replace(/'/g, "\\'")}' }`,
        },
      });

      const reviewerBuildRequestTask = taskBuilder({
        name: 'Reviewer Context Assembly Passthrough',
        description: 'Builds LLM request for reviewer agent',
        inputSchema: s.object({
          userMessage: s.string(),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        steps: [reviewerBuildRequestStep],
      });

      const reviewerBuildRequestNode = nodeBuilder({
        ref: 'build_request',
        name: 'Build Request',
        task: reviewerBuildRequestTask,
        taskVersion: 1,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': 'result.llmRequest',
        },
      });

      const reviewerContextAssemblyWorkflow = workflowBuilder({
        name: 'Reviewer Context Assembly Passthrough',
        description: 'Test passthrough for reviewer context assembly',
        inputSchema: s.object({
          conversationId: s.string(),
          userMessage: s.string(),
          recentTurns: s.array(s.object({})),
          modelProfileId: s.string(),
          toolIds: s.array(s.string()),
          toolDefinitions: s.array(s.object({})),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        outputMapping: {
          llmRequest: 'output.llmRequest',
        },
        initialNodeRef: 'build_request',
        nodes: [reviewerBuildRequestNode],
        transitions: [],
      });

      const reviewerContextAssemblySetup = await createWorkflow(
        ctx,
        reviewerContextAssemblyWorkflow,
      );
      createdResources.workflowIds.push(reviewerContextAssemblySetup.workflowId);
      createdResources.taskIds.push(...reviewerContextAssemblySetup.createdResources.taskIds);
      createdResources.actionIds.push(...reviewerContextAssemblySetup.createdResources.actionIds);

      // --- Memory Extraction Noop (shared) ---
      console.log('Creating memory extraction noop workflow...');
      const noopAction = actionBuilder({
        name: 'Noop',
        description: 'Does nothing',
        kind: 'context',
        implementation: {},
      });

      const noopStep = stepBuilder({
        ref: 'noop',
        ordinal: 0,
        action: noopAction,
        inputMapping: {},
        outputMapping: {},
      });

      const noopTask = taskBuilder({
        name: 'Memory Extraction Noop',
        description: 'Does nothing',
        inputSchema: s.object({}),
        outputSchema: s.object({}),
        steps: [noopStep],
      });

      const noopNode = nodeBuilder({
        ref: 'noop',
        name: 'Noop',
        task: noopTask,
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      const memoryExtractionWorkflow = workflowBuilder({
        name: 'Memory Extraction Noop',
        description: 'Test noop for memory extraction',
        inputSchema: s.object({
          agentId: s.string(),
          turnId: s.string(),
          transcript: s.array(s.object({})),
        }),
        outputSchema: s.object({}),
        outputMapping: {},
        initialNodeRef: 'noop',
        nodes: [noopNode],
        transitions: [],
      });

      const memoryExtractionSetup = await createWorkflow(ctx, memoryExtractionWorkflow);
      createdResources.workflowIds.push(memoryExtractionSetup.workflowId);
      createdResources.taskIds.push(...memoryExtractionSetup.createdResources.taskIds);
      createdResources.actionIds.push(...memoryExtractionSetup.createdResources.actionIds);

      // =========================================================================
      // SETUP: Create reviewer agent (the target of the delegate call)
      // =========================================================================
      console.log('Creating reviewer persona...');
      const reviewerPersonaResponse = await wonder.personas.create({
        name: 'Reviewer',
        description: 'Code reviewer agent for testing delegate mode',
        systemPrompt: reviewerSystemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowDefId: reviewerContextAssemblySetup.workflowDefId,
        memoryExtractionWorkflowDefId: memoryExtractionSetup.workflowDefId,
        toolIds: [], // Reviewer has no tools - just responds with text
        recentTurnsLimit: 10,
      });
      createdResources.personaIds.push(reviewerPersonaResponse.personaId);
      console.log(`   Created reviewer persona: ${reviewerPersonaResponse.personaId}`);

      console.log('Creating reviewer agent...');
      const reviewerAgentResponse = await wonder.agents.create({
        name: 'Reviewer',
        projectIds: [ctx.projectId],
        personaId: reviewerPersonaResponse.personaId,
      });
      createdResources.agentIds.push(reviewerAgentResponse.agentId);
      console.log(`   Created reviewer agent: ${reviewerAgentResponse.agentId}`);

      // =========================================================================
      // SETUP: Create tool that targets the reviewer agent
      // =========================================================================
      console.log('Creating ask_reviewer tool (sync, targets agent, delegate mode)...');
      const toolResponse = await wonder.tools.create({
        name: 'ask_reviewer',
        description:
          'Ask the code reviewer to review some code. Use this when the user wants code reviewed.',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The code to review' },
          },
          required: ['code'],
        },
        targetType: 'agent', // KEY: This tool targets an agent
        targetId: reviewerAgentResponse.agentId,
        async: false, // KEY: Sync tool - manager waits for reviewer's response
        invocationMode: 'delegate', // KEY: Delegate mode - isolated context
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create manager agent with the ask_reviewer tool
      // =========================================================================
      console.log('Creating manager persona...');
      const managerPersonaResponse = await wonder.personas.create({
        name: 'Manager',
        description: 'Manager agent that delegates to reviewer',
        systemPrompt: managerSystemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowDefId: managerContextAssemblySetup.workflowDefId,
        memoryExtractionWorkflowDefId: memoryExtractionSetup.workflowDefId,
        toolIds: [toolResponse.toolId],
        recentTurnsLimit: 10,
      });
      createdResources.personaIds.push(managerPersonaResponse.personaId);
      console.log(`   Created manager persona: ${managerPersonaResponse.personaId}`);

      console.log('Creating manager agent...');
      const managerAgentResponse = await wonder.agents.create({
        name: 'Manager',
        projectIds: [ctx.projectId],
        personaId: managerPersonaResponse.personaId,
      });
      createdResources.agentIds.push(managerAgentResponse.agentId);
      console.log(`   Created manager agent: ${managerAgentResponse.agentId}`);

      // =========================================================================
      // SETUP: Create conversation with manager agent
      // =========================================================================
      console.log('Creating conversation...');
      const conversationResponse = await wonder.conversations.create({
        participants: [
          { type: 'user', userId: 'test_user' },
          { type: 'agent', agentId: managerAgentResponse.agentId },
        ],
        status: 'active',
      });
      const conversationId = conversationResponse.conversationId;
      console.log(`   Created conversation: ${conversationId}`);

      // =========================================================================
      // EXECUTE: Run conversation with message that should trigger agent delegation
      // =========================================================================
      console.log('Starting conversation execution...');
      const result = await executeConversation(
        conversationId,
        [{ role: 'user', content: 'Please review this code: function add(a, b) { return a + b; }' }],
        { logEvents: true },
      );

      // Output debug info
      const apiKey = process.env.API_KEY ?? '$API_KEY';
      console.log('\nConversation Info:');
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   turnIds: ${result.turnIds.join(', ')}`);
      console.log(`   status: ${result.status}`);
      console.log('\nDebug Query Examples:');
      console.log(
        `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events?streamId=${conversationId}"`,
      );
      console.log(
        `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events/trace?streamId=${conversationId}"`,
      );

      // =========================================================================
      // ASSERT: Basic execution success
      // =========================================================================
      expect(result.status).toBe('completed');
      expect(result.turnIds).toHaveLength(1);

      const trace = new ConversationTraceEventCollection(result.traceEvents);

      // =========================================================================
      // ASSERT: Structural invariants
      // =========================================================================
      assertConversationInvariants(trace);

      // =========================================================================
      // ASSERT: Turn lifecycle
      // =========================================================================
      const turnStarts = trace.turns.starts();
      expect(turnStarts).toHaveLength(1);

      const turnId = turnStarts[0].payload.turnId;
      expect(turnId).toBe(result.turnIds[0]);

      const turnCompletions = trace.turns.completions();
      expect(turnCompletions).toHaveLength(1);
      expect(turnCompletions[0].payload.turnId).toBe(turnId);

      // =========================================================================
      // ASSERT: Tool dispatch targets agent (not task or workflow)
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches.length).toBeGreaterThanOrEqual(1);

      // Should be a sync dispatch (not async)
      const syncDispatches = trace.tools.syncDispatches();
      expect(syncDispatches.length).toBeGreaterThanOrEqual(1);

      // Check tool dispatch payload - KEY ASSERTIONS for test 07
      const toolDispatch = syncDispatches[0];
      expect(toolDispatch.payload.async).toBe(false);
      expect(toolDispatch.payload.targetType).toBe('agent'); // Dispatches to agent
      expect(toolDispatch.payload.turnId).toBe(turnId);
      expect(toolDispatch.payload.toolName).toBe('ask_reviewer');

      // Should NOT have async dispatches for this tool
      const asyncDispatches = trace.tools.asyncDispatches();
      const reviewerAsyncDispatches = asyncDispatches.filter(
        (d) => d.payload.toolName === 'ask_reviewer',
      );
      expect(reviewerAsyncDispatches).toHaveLength(0);

      // =========================================================================
      // ASSERT: Agent dispatch events (conversation-level observability)
      // =========================================================================
      // The conversation trace shows dispatch.agent.queued event with mode
      const agentQueued = trace.all().filter((e) => e.type === 'dispatch.agent.queued');
      expect(agentQueued.length).toBeGreaterThanOrEqual(1);

      // The queued dispatch should reference our reviewer agent and delegate mode
      const reviewerDispatchQueued = agentQueued.find(
        (e) => (e.payload as { agentId?: string }).agentId === reviewerAgentResponse.agentId,
      );
      expect(reviewerDispatchQueued).toBeDefined();
      expect((reviewerDispatchQueued!.payload as { mode: string }).mode).toBe('delegate');
      expect((reviewerDispatchQueued!.payload as { async: boolean }).async).toBe(false);

      // =========================================================================
      // ASSERT: Async operation tracking (sync tools still tracked internally)
      // =========================================================================
      const asyncTracked = trace.all().filter((e) => e.type === 'operation.async.tracked');
      expect(asyncTracked.length).toBeGreaterThanOrEqual(1);

      const asyncWaiting = trace.all().filter((e) => e.type === 'operation.async.marked_waiting');
      expect(asyncWaiting.length).toBeGreaterThanOrEqual(1);

      const asyncResumed = trace.all().filter((e) => e.type === 'operation.async.resumed');
      expect(asyncResumed.length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Tool result recorded (move with result)
      // =========================================================================
      const moveResults = trace.moves.resultsForTurn(turnId);
      expect(moveResults.length).toBeGreaterThanOrEqual(1);

      // Result should reference the same tool call
      const toolCallId = toolDispatch.payload.toolCallId;
      const matchingResult = moveResults.find((r) => r.payload.toolCallId === toolCallId);
      expect(matchingResult).toBeDefined();

      // =========================================================================
      // ASSERT: Multiple LLM calls (before and after agent response)
      // =========================================================================
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(2);

      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(2);

      // First response should have tool call
      const firstResponse = llmResponses[0];
      expect(firstResponse.payload.toolCallCount).toBeGreaterThan(0);

      // Last response should be text (final answer after receiving reviewer feedback)
      const lastResponse = llmResponses[llmResponses.length - 1];
      expect(lastResponse.payload.hasText).toBe(true);

      // =========================================================================
      // ASSERT: Move recorded for tool call
      // =========================================================================
      const moves = trace.moves.forTurn(turnId);
      expect(moves.length).toBeGreaterThanOrEqual(1);

      // Should have at least one move with tool call
      const moveWithToolCall = moves.find((m) => m.payload.hasToolCall);
      expect(moveWithToolCall).toBeDefined();

      // =========================================================================
      // ASSERT: Messages
      // =========================================================================
      const userMessages = trace.messages.user();
      expect(userMessages.length).toBeGreaterThanOrEqual(1);

      const agentMessages = trace.messages.agent();
      expect(agentMessages.length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Causal ordering
      // =========================================================================
      // Events should follow causal order:
      // turn.created < tool.dispatched < agent.queued < async.tracked < async.waiting < move.result_recorded < async.resumed < turn.completed

      const turnStartSeq = turnStarts[0].sequence;
      const toolDispatchSeq = toolDispatch.sequence;
      const agentQueuedSeq = reviewerDispatchQueued!.sequence;
      const asyncTrackedSeq = asyncTracked[0].sequence;
      const asyncWaitingSeq = asyncWaiting[0].sequence;
      const asyncResumedSeq = asyncResumed[0].sequence;
      const resultSeq = matchingResult!.sequence;
      const turnCompletedSeq = turnCompletions[0].sequence;

      // Tool dispatch should come after turn start
      expect(turnStartSeq).toBeLessThan(toolDispatchSeq);

      // Agent queued should come after tool dispatch
      expect(toolDispatchSeq).toBeLessThan(agentQueuedSeq);

      // Async tracked should come after agent queued
      expect(agentQueuedSeq).toBeLessThan(asyncTrackedSeq);

      // Async waiting should come after tracked (sync tool waits)
      expect(asyncTrackedSeq).toBeLessThan(asyncWaitingSeq);

      // Result should come after waiting (agent completed and delivered response)
      expect(asyncWaitingSeq).toBeLessThan(resultSeq);

      // Async resumed should come after result is recorded
      expect(resultSeq).toBeLessThan(asyncResumedSeq);

      // Turn completion should come after result
      expect(resultSeq).toBeLessThan(turnCompletedSeq);

      // =========================================================================
      // ASSERT: Event manifest (count by type)
      // =========================================================================
      console.log('\nEvent Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Tool dispatches: ${toolDispatches.length}`);
      console.log(`   Sync dispatches: ${syncDispatches.length}`);
      console.log(`   Async dispatches: ${asyncDispatches.length}`);
      console.log(`   Agent queued: ${agentQueued.length}`);
      console.log(`   Async tracked: ${asyncTracked.length}`);
      console.log(`   Async waiting: ${asyncWaiting.length}`);
      console.log(`   Async resumed: ${asyncResumed.length}`);
      console.log(`   Move results: ${moveResults.length}`);
      console.log(`   Moves with tool calls: ${moves.filter((m) => m.payload.hasToolCall).length}`);
      console.log(`   LLM calls: ${llmCalls.length}`);
      console.log(`   LLM responses: ${llmResponses.length}`);
      console.log(`   User messages: ${userMessages.length}`);
      console.log(`   Agent messages: ${agentMessages.length}`);
      console.log(`   Total trace events: ${result.traceEvents.length}`);
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      console.log('Starting cleanup...');
      const setup = {
        ...ctx,
        conversationId: '',
        agentId: createdResources.agentIds[createdResources.agentIds.length - 1] ?? '',
        personaId: createdResources.personaIds[createdResources.personaIds.length - 1] ?? '',
        createdResources: {
          toolIds: createdResources.toolIds,
          taskIds: createdResources.taskIds,
          workflowIds: createdResources.workflowIds,
          personaIds: createdResources.personaIds,
          agentIds: createdResources.agentIds,
        },
      };
      await cleanupConversationTest(setup);
      console.log('Cleanup complete');
    }
  });
});
