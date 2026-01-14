/**
 * Conversation Test 03: Single Turn, Async Tool
 *
 * Validates async tool dispatch within the agent loop:
 * 1. Agent receives user message requesting tool use
 * 2. LLM decides to invoke a tool (async: true)
 * 3. Tool dispatch to target (workflow in this case)
 * 4. Agent does NOT wait—responds immediately with acknowledgment
 * 5. Async operation tracked on turn
 * 6. Turn stays active while async work is pending
 * 7. When async completes, agent posts follow-up message with results
 * 8. Turn completes when no pending async work
 *
 * This test proves the async tool dispatch → immediate response → continuation cycle works correctly.
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

describe('Conversation: 03 - Single Turn, Async Tool', () => {
  it('dispatches async tool, responds immediately, continues on completion', async () => {
    // =========================================================================
    // SETUP: Create test infrastructure
    // =========================================================================
    console.log('🔧 Setting up test project...');
    const ctx = await setupTestContext();

    const createdResources = {
      toolIds: [] as string[],
      taskIds: [] as string[],
      workflowIds: [] as string[],
      actionIds: [] as string[],
      promptSpecIds: [] as string[],
      personaId: undefined as string | undefined,
      agentId: undefined as string | undefined,
    };

    try {
      // =========================================================================
      // SETUP: Create a workflow that the async tool will target
      // =========================================================================
      console.log('📦 Creating research workflow (async tool target)...');

      // The research workflow simulates a slow operation that returns findings
      const researchOutputSchema = s.object(
        { findings: s.string(), sources: s.array(s.string()) },
        { required: ['findings', 'sources'] },
      );

      const researchAction = action({
        name: 'Research Action',
        description: 'Simulates research by returning mock findings',
        kind: 'mock',
        implementation: {
          schema: researchOutputSchema,
          options: {
            // Delay ensures the async tool takes enough time for the agent
            // to respond with an acknowledgment before the result arrives
            delay: { minMs: 2000, maxMs: 3000 },
          },
        },
      });

      const researchStep = step({
        ref: 'research_step',
        ordinal: 0,
        action: researchAction,
        inputMapping: {},
        outputMapping: {
          'output.findings': 'result.findings',
          'output.sources': 'result.sources',
        },
      });

      const researchTask = task({
        name: 'Research Task',
        description: 'Performs research on a topic',
        inputSchema: s.object({ topic: s.string() }),
        outputSchema: researchOutputSchema,
        steps: [researchStep],
      });

      const researchNode = node({
        ref: 'research',
        name: 'Research',
        task: researchTask,
        taskVersion: 1,
        inputMapping: {
          topic: 'input.topic',
        },
        outputMapping: {
          'output.findings': 'result.findings',
          'output.sources': 'result.sources',
        },
      });

      const researchWorkflow = workflow({
        name: 'Research Workflow',
        description: 'Async research workflow for testing',
        inputSchema: s.object({ topic: s.string() }),
        outputSchema: researchOutputSchema,
        outputMapping: {
          findings: 'output.findings',
          sources: 'output.sources',
        },
        initialNodeRef: 'research',
        nodes: [researchNode],
        transitions: [],
      });

      const researchWorkflowSetup = await createWorkflow(ctx, researchWorkflow);
      createdResources.workflowIds.push(researchWorkflowSetup.workflowId);
      createdResources.taskIds.push(...researchWorkflowSetup.createdResources.taskIds);
      createdResources.actionIds.push(...researchWorkflowSetup.createdResources.actionIds);
      console.log(`   Created research workflow: ${researchWorkflowSetup.workflowId}`);

      // =========================================================================
      // SETUP: Create passthrough workflows for context assembly and memory extraction
      // =========================================================================
      console.log('📦 Creating context assembly passthrough workflow...');
      const systemPrompt =
        'You are a helpful research assistant. When asked to research a topic, use the research tool. The research tool is async so respond immediately after invoking it, then summarize the results when they arrive.';

      // Context assembly passthrough
      const contextAction = actionBuilder({
        name: 'Build LLM Request',
        description: 'Builds minimal LLM request from user message',
        kind: 'context',
        implementation: {},
      });

      const buildRequestStep = stepBuilder({
        ref: 'build_request',
        ordinal: 0,
        action: contextAction,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${systemPrompt.replace(/'/g, "\\'")}' }`,
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

      const buildRequestTask = taskBuilder({
        name: 'Context Assembly Passthrough',
        description: 'Builds LLM request from user message',
        inputSchema: s.object({
          userMessage: s.string(),
        }),
        outputSchema: s.object({
          llmRequest: llmRequestSchema,
        }),
        steps: [buildRequestStep],
      });

      const buildRequestNode = nodeBuilder({
        ref: 'build_request',
        name: 'Build Request',
        task: buildRequestTask,
        taskVersion: 1,
        inputMapping: {
          userMessage: 'input.userMessage',
        },
        outputMapping: {
          'output.llmRequest': 'result.llmRequest',
        },
      });

      const contextAssemblyWorkflow = workflowBuilder({
        name: 'Context Assembly Passthrough',
        description: 'Test passthrough for context assembly',
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
        nodes: [buildRequestNode],
        transitions: [],
      });

      const contextAssemblySetup = await createWorkflow(ctx, contextAssemblyWorkflow);
      createdResources.workflowIds.push(contextAssemblySetup.workflowId);
      createdResources.taskIds.push(...contextAssemblySetup.createdResources.taskIds);
      createdResources.actionIds.push(...contextAssemblySetup.createdResources.actionIds);

      // Memory extraction noop
      console.log('📦 Creating memory extraction noop workflow...');
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
      // SETUP: Create async tool that targets the research workflow
      // =========================================================================
      console.log('🔧 Creating research tool (async)...');
      const toolResponse = await wonder.tools.create({
        name: 'research',
        description:
          'Research a topic and gather information. This is an async operation - results will be available after some time.',
        inputSchema: {
          type: 'object',
          properties: { topic: { type: 'string', description: 'The topic to research' } },
          required: ['topic'],
        },
        targetType: 'workflow',
        targetId: researchWorkflowSetup.workflowId,
        async: true, // KEY: This is an async tool
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create persona with the async research tool
      // =========================================================================
      console.log('👤 Creating persona...');
      const personaResponse = await wonder.personas.create({
        name: 'Research Agent',
        description: 'Test agent with async research tool',
        systemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowId: contextAssemblySetup.workflowId,
        memoryExtractionWorkflowId: memoryExtractionSetup.workflowId,
        toolIds: [toolResponse.toolId],
        recentTurnsLimit: 10,
      });
      createdResources.personaId = personaResponse.personaId;
      console.log(`   Created persona: ${personaResponse.personaId}`);

      // =========================================================================
      // SETUP: Create agent and conversation
      // =========================================================================
      console.log('🤖 Creating agent...');
      const agentResponse = await wonder.agents.create({
        projectIds: [ctx.projectId],
        personaId: personaResponse.personaId,
      });
      createdResources.agentId = agentResponse.agentId;
      console.log(`   Created agent: ${agentResponse.agentId}`);

      console.log('💬 Creating conversation...');
      const conversationResponse = await wonder.conversations.create({
        participants: [
          { type: 'user', userId: 'test_user' },
          { type: 'agent', agentId: agentResponse.agentId },
        ],
        status: 'active',
      });
      const conversationId = conversationResponse.conversationId;
      console.log(`   Created conversation: ${conversationId}`);

      // =========================================================================
      // EXECUTE: Run conversation with message that should trigger async tool use
      // =========================================================================
      console.log('🚀 Starting conversation execution...');
      const result = await executeConversation(
        conversationId,
        [{ role: 'user', content: 'Please research authentication patterns for web APIs' }],
        { logEvents: true, enableTraceEvents: true },
      );

      // Output debug info
      const apiKey = process.env.API_KEY ?? '$API_KEY';
      console.log('\n📋 Conversation Info:');
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   turnIds: ${result.turnIds.join(', ')}`);
      console.log(`   status: ${result.status}`);
      console.log('\n🔍 Debug Query Examples:');
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
      // ASSERT: Tool dispatch (async)
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches.length).toBeGreaterThanOrEqual(1);

      // Should be an async dispatch
      const asyncDispatches = trace.tools.asyncDispatches();
      expect(asyncDispatches.length).toBeGreaterThanOrEqual(1);

      // Check tool dispatch payload
      const asyncDispatch = asyncDispatches[0];
      expect(asyncDispatch.payload.async).toBe(true);
      expect(asyncDispatch.payload.targetType).toBe('workflow');
      expect(asyncDispatch.payload.turnId).toBe(turnId);
      expect(asyncDispatch.payload.toolName).toBe('research');

      // Should NOT have any sync dispatches for this tool
      const syncDispatches = trace.tools.syncDispatches();
      const researchSyncDispatches = syncDispatches.filter(
        (d) => d.payload.toolName === 'research',
      );
      expect(researchSyncDispatches).toHaveLength(0);

      // =========================================================================
      // ASSERT: Async operation tracking
      // =========================================================================
      // The turn should track the async operation
      const asyncTrackedEvents = trace
        .all()
        .filter((e) => e.type === 'operation.async.tracked');
      expect(asyncTrackedEvents.length).toBeGreaterThanOrEqual(1);

      // The async operation should resume (complete and return to agent)
      const asyncResumedEvents = trace
        .all()
        .filter((e) => e.type === 'operation.async.resumed');
      expect(asyncResumedEvents.length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: LLM calls (two rounds: tool dispatch + continuation)
      // =========================================================================
      // With async tools and delay, the agent should:
      // 1. First LLM call decides to use async tool
      // 2. Second LLM call processes result and responds
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(2);

      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(2);

      // First response should have tool call (triggers the async operation)
      const firstResponse = llmResponses[0];
      expect(firstResponse.payload.toolCallCount).toBeGreaterThan(0);

      // =========================================================================
      // ASSERT: Agent messages (acknowledgment + final result)
      // =========================================================================
      // With async tools, the agent should:
      // 1. Send an acknowledgment immediately after dispatching the async tool
      // 2. Send the final response after the async operation completes
      const agentMessages = trace.messages.agent();
      expect(agentMessages.length).toBeGreaterThanOrEqual(2);

      // First message is acknowledgment (before async completes)
      const firstAgentMessage = agentMessages[0];
      expect(firstAgentMessage.payload.turnId).toBe(turnId);

      // Second message is final response (after async completes)
      const lastAgentMessage = agentMessages[agentMessages.length - 1];
      expect(lastAgentMessage.payload.turnId).toBe(turnId);

      // =========================================================================
      // ASSERT: Move recorded for async tool call
      // =========================================================================
      const moves = trace.moves.forTurn(turnId);
      expect(moves.length).toBeGreaterThanOrEqual(1);

      // Should have at least one move with tool call
      const moveWithToolCall = moves.find((m) => m.payload.hasToolCall);
      expect(moveWithToolCall).toBeDefined();

      // =========================================================================
      // ASSERT: Causal ordering
      // =========================================================================
      // Events should follow causal order:
      // turn.created < tool.dispatched < async.tracked < first_message < async.resumed < last_message < turn.completed

      const turnStartSeq = turnStarts[0].sequence;
      const asyncDispatchSeq = asyncDispatch.sequence;
      const asyncTrackedSeq = asyncTrackedEvents[0].sequence;
      const asyncResumedSeq = asyncResumedEvents[0].sequence;
      const turnCompletedSeq = turnCompletions[0].sequence;

      // Async dispatch should come after turn start
      expect(turnStartSeq).toBeLessThan(asyncDispatchSeq);

      // Async tracked should come after dispatch
      expect(asyncDispatchSeq).toBeLessThan(asyncTrackedSeq);

      // First agent message (acknowledgment) should come before async resumed
      expect(firstAgentMessage.sequence).toBeLessThan(asyncResumedSeq);

      // Async resumed should come after tracked
      expect(asyncTrackedSeq).toBeLessThan(asyncResumedSeq);

      // Last agent message should come after async resumed
      expect(asyncResumedSeq).toBeLessThan(lastAgentMessage.sequence);

      // Turn completion should come after async resumed
      expect(asyncResumedSeq).toBeLessThan(turnCompletedSeq);

      // =========================================================================
      // ASSERT: Event manifest (count by type)
      // =========================================================================
      console.log('\n📊 Event Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Tool dispatches: ${toolDispatches.length}`);
      console.log(`   Async dispatches: ${asyncDispatches.length}`);
      console.log(`   Async tracked: ${asyncTrackedEvents.length}`);
      console.log(`   Async resumed: ${asyncResumedEvents.length}`);
      console.log(`   Moves with tool calls: ${moves.filter((m) => m.payload.hasToolCall).length}`);
      console.log(`   LLM calls: ${llmCalls.length}`);
      console.log(`   LLM responses: ${llmResponses.length}`);
      console.log(`   Agent messages: ${agentMessages.length}`);
      console.log(`   Total trace events: ${result.traceEvents.length}`);
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      console.log('🧹 Starting cleanup...');
      const setup = {
        ...ctx,
        conversationId: '',
        agentId: createdResources.agentId ?? '',
        personaId: createdResources.personaId ?? '',
        createdResources: {
          toolIds: createdResources.toolIds,
          taskIds: createdResources.taskIds,
          workflowIds: createdResources.workflowIds,
        },
      };
      await cleanupConversationTest(setup);
      console.log('✨ Cleanup complete');
    }
  });
});
