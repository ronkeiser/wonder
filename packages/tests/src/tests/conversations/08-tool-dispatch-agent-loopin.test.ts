/**
 * Conversation Test 08: Tool Dispatch to Agent (Loop-In Mode)
 *
 * Validates sync tool dispatch to another agent in loop_in mode:
 * 1. Manager agent receives user message requesting collaboration
 * 2. LLM decides to invoke a tool (targetType: 'agent', mode: 'loop_in')
 * 3. Tool dispatch to child agent's ConversationRunner (DO-to-DO)
 * 4. Child agent joins the SAME conversation as a participant
 * 5. Child agent sees shared conversation history (not isolated)
 * 6. Child agent's response is visible to all participants
 * 7. Manager agent continues reasoning after specialist responds
 *
 * Key behaviors being tested:
 * - Agent-to-agent dispatch via ConversationRunner with loop_in mode
 * - Loop-in mode: child agent joins the same conversation
 * - Child agent sees conversation history (contrast with delegate mode)
 * - Participant added to conversation
 * - Responses visible to all participants
 *
 * Key difference from test 07 (delegate mode):
 * - Child agent joins existing conversation (not separate)
 * - Child agent sees conversation history
 * - participant.added event emitted
 * - No separate conversation created
 */

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
  schema as s,
  step as stepBuilder,
  task as taskBuilder,
  workflow as workflowBuilder,
} from '@wonder/sdk';

describe('Conversation: 08 - Tool Dispatch to Agent (Loop-In Mode)', () => {
  it('dispatches sync tool to agent in loop_in mode, agent joins conversation, sees shared history', async () => {
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
      // These will be shared by both the manager and architect agents
      // =========================================================================

      // --- Context Assembly Passthrough (for manager) ---
      console.log('Creating context assembly passthrough workflow for manager...');
      const managerSystemPrompt =
        'You are a manager agent. When the user asks about architecture or design decisions, loop in the architect to join the discussion using the loop_in_architect tool. Work collaboratively with the architect when they join.';

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

      // --- Context Assembly Passthrough (for architect) ---
      console.log('Creating context assembly passthrough workflow for architect...');
      const architectSystemPrompt =
        'You are an architect agent who has been looped into a conversation. You can see the conversation history. Provide architectural guidance and design recommendations. Be collaborative and build on what others have said.';

      const architectContextAction = actionBuilder({
        name: 'Build Architect LLM Request',
        description: 'Builds minimal LLM request for architect agent',
        kind: 'context',
        implementation: {},
      });

      const architectBuildRequestStep = stepBuilder({
        ref: 'build_request',
        ordinal: 0,
        action: architectContextAction,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${architectSystemPrompt.replace(/'/g, "\\'")}' }`,
        },
      });

      const architectBuildRequestTask = taskBuilder({
        name: 'Architect Context Assembly Passthrough',
        description: 'Builds LLM request for architect agent',
        inputSchema: s.object({
          userMessage: s.string(),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        steps: [architectBuildRequestStep],
      });

      const architectBuildRequestNode = nodeBuilder({
        ref: 'build_request',
        name: 'Build Request',
        task: architectBuildRequestTask,
        taskVersion: 1,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': 'result.llmRequest',
        },
      });

      const architectContextAssemblyWorkflow = workflowBuilder({
        name: 'Architect Context Assembly Passthrough',
        description: 'Test passthrough for architect context assembly',
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
        nodes: [architectBuildRequestNode],
        transitions: [],
      });

      const architectContextAssemblySetup = await createWorkflow(
        ctx,
        architectContextAssemblyWorkflow,
      );
      createdResources.workflowIds.push(architectContextAssemblySetup.workflowId);
      createdResources.taskIds.push(...architectContextAssemblySetup.createdResources.taskIds);
      createdResources.actionIds.push(...architectContextAssemblySetup.createdResources.actionIds);

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
      // SETUP: Create architect agent (the target of the loop_in call)
      // =========================================================================
      console.log('Creating architect persona...');
      const architectPersonaResponse = await wonder.personas.create({
        name: 'Architect',
        description: 'Architect agent for testing loop_in mode',
        systemPrompt: architectSystemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowId: architectContextAssemblySetup.workflowId,
        memoryExtractionWorkflowId: memoryExtractionSetup.workflowId,
        toolIds: [], // Architect has no tools - just responds with text
        recentTurnsLimit: 10,
      });
      createdResources.personaIds.push(architectPersonaResponse.personaId);
      console.log(`   Created architect persona: ${architectPersonaResponse.personaId}`);

      console.log('Creating architect agent...');
      const architectAgentResponse = await wonder.agents.create({
        name: 'Architect',
        projectIds: [ctx.projectId],
        personaId: architectPersonaResponse.personaId,
      });
      createdResources.agentIds.push(architectAgentResponse.agentId);
      console.log(`   Created architect agent: ${architectAgentResponse.agentId}`);

      // =========================================================================
      // SETUP: Create tool that targets the architect agent with loop_in mode
      // =========================================================================
      console.log('Creating loop_in_architect tool (sync, targets agent, loop_in mode)...');
      const toolResponse = await wonder.tools.create({
        name: 'loop_in_architect',
        description:
          'Loop in the architect to join the discussion. Use this when you need architectural expertise or design guidance. The architect will join the conversation and can see the history.',
        inputSchema: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Context for why the architect is being looped in' },
          },
          required: ['context'],
        },
        targetType: 'agent', // KEY: This tool targets an agent
        targetId: architectAgentResponse.agentId,
        async: false, // KEY: Sync tool - manager waits for architect's response
        invocationMode: 'loop_in', // KEY: Loop-in mode - joins conversation, sees history
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create manager agent with the loop_in_architect tool
      // =========================================================================
      console.log('Creating manager persona...');
      const managerPersonaResponse = await wonder.personas.create({
        name: 'Manager',
        description: 'Manager agent that loops in architect for design discussions',
        systemPrompt: managerSystemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowId: managerContextAssemblySetup.workflowId,
        memoryExtractionWorkflowId: memoryExtractionSetup.workflowId,
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
      // EXECUTE: Run conversation with message that should trigger agent loop-in
      // =========================================================================
      console.log('Starting conversation execution...');
      const result = await executeConversation(
        conversationId,
        [{ role: 'user', content: 'We need to discuss the API architecture for the new authentication system. Can you get the architect involved?' }],
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
      // ASSERT: Tool dispatch targets agent with loop_in mode
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches.length).toBeGreaterThanOrEqual(1);

      // Should be a sync dispatch (not async)
      const syncDispatches = trace.tools.syncDispatches();
      expect(syncDispatches.length).toBeGreaterThanOrEqual(1);

      // Check tool dispatch payload - KEY ASSERTIONS for test 08
      const toolDispatch = syncDispatches[0];
      expect(toolDispatch.payload.async).toBe(false);
      expect(toolDispatch.payload.targetType).toBe('agent'); // Dispatches to agent
      expect(toolDispatch.payload.turnId).toBe(turnId);
      expect(toolDispatch.payload.toolName).toBe('loop_in_architect');

      // =========================================================================
      // ASSERT: Agent dispatch events with loop_in mode
      // =========================================================================
      const agentQueued = trace.all().filter((e) => e.type === 'dispatch.agent.queued');
      expect(agentQueued.length).toBeGreaterThanOrEqual(1);

      // The queued dispatch should reference our architect agent and loop_in mode
      const architectDispatchQueued = agentQueued.find(
        (e) => (e.payload as { agentId?: string }).agentId === architectAgentResponse.agentId,
      );
      expect(architectDispatchQueued).toBeDefined();
      expect((architectDispatchQueued!.payload as { mode: string }).mode).toBe('loop_in'); // KEY DIFFERENCE from test 07
      expect((architectDispatchQueued!.payload as { async: boolean }).async).toBe(false);

      // =========================================================================
      // ASSERT: Participant added to conversation (loop_in specific)
      // =========================================================================
      // In loop_in mode, the target agent should be added as a participant
      const participantAddedEvents = trace.all().filter((e) => e.type === 'participant.added');
      expect(participantAddedEvents.length).toBeGreaterThanOrEqual(1);

      // Should have added the architect as a participant
      const architectAddedEvent = participantAddedEvents.find(
        (e) => (e.payload as { agentId?: string }).agentId === architectAgentResponse.agentId,
      );
      expect(architectAddedEvent).toBeDefined();
      expect((architectAddedEvent!.payload as { conversationId: string }).conversationId).toBe(conversationId);

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
      // ASSERT: Multiple LLM calls (before and after architect response)
      // =========================================================================
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(2);

      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(2);

      // First response should have tool call
      const firstResponse = llmResponses[0];
      expect(firstResponse.payload.toolCallCount).toBeGreaterThan(0);

      // Last response should be text (final answer after architect joins)
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
      // turn.created < tool.dispatched < agent.queued < participant.added < async.tracked < async.waiting < move.result_recorded < async.resumed < turn.completed

      const turnStartSeq = turnStarts[0].sequence;
      const toolDispatchSeq = toolDispatch.sequence;
      const agentQueuedSeq = architectDispatchQueued!.sequence;
      const participantAddedSeq = architectAddedEvent!.sequence;
      const asyncTrackedSeq = asyncTracked[0].sequence;
      const asyncWaitingSeq = asyncWaiting[0].sequence;
      const asyncResumedSeq = asyncResumed[0].sequence;
      const resultSeq = matchingResult!.sequence;
      const turnCompletedSeq = turnCompletions[0].sequence;

      // Tool dispatch should come after turn start
      expect(turnStartSeq).toBeLessThan(toolDispatchSeq);

      // Agent queued should come after tool dispatch
      expect(toolDispatchSeq).toBeLessThan(agentQueuedSeq);

      // Participant added should come after agent queued (loop_in specific ordering)
      expect(agentQueuedSeq).toBeLessThan(participantAddedSeq);

      // Async tracked should come after participant added
      expect(participantAddedSeq).toBeLessThan(asyncTrackedSeq);

      // Async waiting should come after tracked (sync tool waits)
      expect(asyncTrackedSeq).toBeLessThan(asyncWaitingSeq);

      // Result should come after waiting (architect completed and delivered response)
      expect(asyncWaitingSeq).toBeLessThan(resultSeq);

      // Async resumed should come after result is recorded
      expect(resultSeq).toBeLessThan(asyncResumedSeq);

      // Turn completion should come after result
      expect(resultSeq).toBeLessThan(turnCompletedSeq);

      // =========================================================================
      // ASSERT: No separate conversation created (contrast with delegate mode)
      // =========================================================================
      // In loop_in mode, we should NOT see a new conversation created for the architect
      // The dispatch.agent.queued event should use the SAME conversation ID
      const conversationCreatedEvents = trace.all().filter((e) => e.type === 'conversation.created');
      // Filter out the initial conversation creation (if present in trace)
      const newConversationCreated = conversationCreatedEvents.filter(
        (e) => (e.payload as { conversationId: string }).conversationId !== conversationId,
      );
      // In loop_in mode, no new conversation should be created for the target agent
      expect(newConversationCreated).toHaveLength(0);

      // =========================================================================
      // ASSERT: Event manifest (count by type)
      // =========================================================================
      console.log('\nEvent Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Tool dispatches: ${toolDispatches.length}`);
      console.log(`   Sync dispatches: ${syncDispatches.length}`);
      console.log(`   Agent queued: ${agentQueued.length}`);
      console.log(`   Participant added: ${participantAddedEvents.length}`);
      console.log(`   Async tracked: ${asyncTracked.length}`);
      console.log(`   Async waiting: ${asyncWaiting.length}`);
      console.log(`   Async resumed: ${asyncResumed.length}`);
      console.log(`   Move results: ${moveResults.length}`);
      console.log(`   Moves with tool calls: ${moves.filter((m) => m.payload.hasToolCall).length}`);
      console.log(`   LLM calls: ${llmCalls.length}`);
      console.log(`   LLM responses: ${llmResponses.length}`);
      console.log(`   User messages: ${userMessages.length}`);
      console.log(`   Agent messages: ${agentMessages.length}`);
      console.log(`   New conversations created: ${newConversationCreated.length}`);
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
