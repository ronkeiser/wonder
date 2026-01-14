/**
 * Conversation Test 06: Tool Dispatch to Workflow (Sync)
 *
 * Validates sync tool dispatch to a WorkflowCoordinator:
 * 1. Agent receives user message requesting tool use
 * 2. LLM decides to invoke a tool (sync, targetType: 'workflow')
 * 3. Tool dispatch to WorkflowCoordinator (sub-workflow execution)
 * 4. Agent waits for workflow completion
 * 5. Workflow result recorded as move
 * 6. LLM continues reasoning with result
 * 7. Agent responds with final message
 *
 * Key difference from test 02 (sync task):
 * - Tool targets a workflow, not a task
 * - Workflow executes via WorkflowCoordinator (DO-to-DO dispatch)
 * - Conversation trace shows dispatch.workflow.queued (not internal workflow.run.* events)
 *
 * Key difference from test 03 (async workflow):
 * - Tool is sync (async: false), so agent waits for result
 * - Only one LLM response with final answer (no immediate acknowledgment)
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

describe('Conversation: 06 - Tool Dispatch to Workflow (Sync)', () => {
  it('dispatches sync tool to workflow, waits for completion, resumes with result', async () => {
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
      personaId: undefined as string | undefined,
      agentId: undefined as string | undefined,
    };

    try {
      // =========================================================================
      // SETUP: Create a workflow that the sync tool will target
      // =========================================================================
      console.log('Creating lookup workflow (sync tool target)...');

      // The lookup workflow simulates a quick operation that returns structured data
      // Unlike test 03, this is designed to be fast (no delay) for sync dispatch
      const lookupOutputSchema = s.object(
        { answer: s.string(), confidence: s.number() },
        { required: ['answer', 'confidence'] },
      );

      const lookupAction = action({
        name: 'Lookup Action',
        description: 'Simulates a lookup operation returning structured data',
        kind: 'mock',
        implementation: {
          schema: lookupOutputSchema,
          // No delay - sync tools should complete quickly
        },
      });

      const lookupStep = step({
        ref: 'lookup_step',
        ordinal: 0,
        action: lookupAction,
        inputMapping: {},
        outputMapping: {
          'output.answer': 'result.answer',
          'output.confidence': 'result.confidence',
        },
      });

      const lookupTask = task({
        name: 'Lookup Task',
        description: 'Performs a lookup operation',
        inputSchema: s.object({ query: s.string() }),
        outputSchema: lookupOutputSchema,
        steps: [lookupStep],
      });

      const lookupNode = node({
        ref: 'lookup',
        name: 'Lookup',
        task: lookupTask,
        taskVersion: 1,
        inputMapping: {
          query: 'input.query',
        },
        outputMapping: {
          'output.answer': 'result.answer',
          'output.confidence': 'result.confidence',
        },
      });

      const lookupWorkflow = workflow({
        name: 'Lookup Workflow',
        description: 'Sync lookup workflow for testing tool dispatch to workflow',
        inputSchema: s.object({ query: s.string() }),
        outputSchema: lookupOutputSchema,
        outputMapping: {
          answer: 'output.answer',
          confidence: 'output.confidence',
        },
        initialNodeRef: 'lookup',
        nodes: [lookupNode],
        transitions: [],
      });

      const lookupWorkflowSetup = await createWorkflow(ctx, lookupWorkflow);
      createdResources.workflowIds.push(lookupWorkflowSetup.workflowId);
      createdResources.taskIds.push(...lookupWorkflowSetup.createdResources.taskIds);
      createdResources.actionIds.push(...lookupWorkflowSetup.createdResources.actionIds);
      console.log(`   Created lookup workflow: ${lookupWorkflowSetup.workflowId}`);

      // =========================================================================
      // SETUP: Create passthrough workflows for context assembly and memory extraction
      // =========================================================================
      console.log('Creating context assembly passthrough workflow...');
      const systemPrompt =
        'You are a helpful assistant with a lookup tool. When the user asks you to look something up, use the lookup tool. After using the tool, respond with the answer and confidence level.';

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
      // SETUP: Create sync tool that targets the lookup workflow
      // =========================================================================
      console.log('Creating lookup tool (sync, targets workflow)...');
      const toolResponse = await wonder.tools.create({
        name: 'lookup',
        description:
          'Look up information and get an answer with confidence score. Use this when asked to look something up.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The query to look up' } },
          required: ['query'],
        },
        targetType: 'workflow', // KEY: This tool targets a workflow, not a task
        targetId: lookupWorkflowSetup.workflowId,
        async: false, // KEY: This is a sync tool - agent waits for result
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create persona with the sync lookup tool
      // =========================================================================
      console.log('Creating persona...');
      const personaResponse = await wonder.personas.create({
        name: 'Lookup Agent',
        description: 'Test agent with sync workflow tool',
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
      console.log('Creating agent...');
      const agentResponse = await wonder.agents.create({
        projectIds: [ctx.projectId],
        personaId: personaResponse.personaId,
      });
      createdResources.agentId = agentResponse.agentId;
      console.log(`   Created agent: ${agentResponse.agentId}`);

      console.log('Creating conversation...');
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
      // EXECUTE: Run conversation with message that should trigger workflow tool use
      // =========================================================================
      console.log('Starting conversation execution...');
      const result = await executeConversation(
        conversationId,
        [{ role: 'user', content: 'Please look up: what is the capital of France?' }],
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
      // ASSERT: Tool dispatch targets workflow (not task)
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches.length).toBeGreaterThanOrEqual(1);

      // Should be a sync dispatch (not async)
      const syncDispatches = trace.tools.syncDispatches();
      expect(syncDispatches.length).toBeGreaterThanOrEqual(1);

      // Check tool dispatch payload - KEY ASSERTIONS for test 06
      const toolDispatch = syncDispatches[0];
      expect(toolDispatch.payload.async).toBe(false);
      expect(toolDispatch.payload.targetType).toBe('workflow'); // Dispatches to workflow, not task
      expect(toolDispatch.payload.turnId).toBe(turnId);
      expect(toolDispatch.payload.toolName).toBe('lookup');

      // Should NOT have async dispatches for this tool
      const asyncDispatches = trace.tools.asyncDispatches();
      const lookupAsyncDispatches = asyncDispatches.filter(
        (d) => d.payload.toolName === 'lookup',
      );
      expect(lookupAsyncDispatches).toHaveLength(0);

      // =========================================================================
      // ASSERT: Workflow dispatch events (conversation-level observability)
      // =========================================================================
      // The conversation trace shows dispatch events, not internal workflow events.
      // Internal workflow events (workflow.run.started/completed) are on the workflow's
      // own stream. The conversation sees: dispatch.workflow.queued, async tracking events.

      // Verify workflow dispatch was queued
      const workflowQueued = trace
        .all()
        .filter((e) => e.type === 'dispatch.workflow.queued');
      expect(workflowQueued.length).toBeGreaterThanOrEqual(1);

      // The queued dispatch should reference our lookup workflow
      const lookupDispatchQueued = workflowQueued.find(
        (e) => (e.payload as { workflowId?: string }).workflowId === lookupWorkflowSetup.workflowId,
      );
      expect(lookupDispatchQueued).toBeDefined();
      expect((lookupDispatchQueued!.payload as { async: boolean }).async).toBe(false);

      // For sync workflow dispatch, the conversation tracks it as an async operation
      // internally (operation.async.tracked) but waits for completion (operation.async.marked_waiting)
      const asyncTracked = trace
        .all()
        .filter((e) => e.type === 'operation.async.tracked');
      expect(asyncTracked.length).toBeGreaterThanOrEqual(1);

      const asyncWaiting = trace
        .all()
        .filter((e) => e.type === 'operation.async.marked_waiting');
      expect(asyncWaiting.length).toBeGreaterThanOrEqual(1);

      const asyncResumed = trace
        .all()
        .filter((e) => e.type === 'operation.async.resumed');
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
      // ASSERT: Multiple LLM calls (before and after tool)
      // =========================================================================
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(2);

      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(2);

      // First response should have tool call
      const firstResponse = llmResponses[0];
      expect(firstResponse.payload.toolCallCount).toBeGreaterThan(0);

      // Last response should be text (final answer)
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

      // For sync tools, agent produces at least one message (final response)
      // The LLM may produce additional text during the loop, but the key behavior is:
      // - No separate "acknowledgment" message is sent before tool execution
      // - The agent waits for the workflow, then continues the loop
      expect(agentMessages.length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Causal ordering
      // =========================================================================
      // Events should follow causal order:
      // turn.created < tool.dispatched < workflow.queued < async.tracked < async.waiting < move.result_recorded < async.resumed < turn.completed

      const turnStartSeq = turnStarts[0].sequence;
      const toolDispatchSeq = toolDispatch.sequence;
      const workflowQueuedSeq = lookupDispatchQueued!.sequence;
      const asyncTrackedSeq = asyncTracked[0].sequence;
      const asyncWaitingSeq = asyncWaiting[0].sequence;
      const asyncResumedSeq = asyncResumed[0].sequence;
      const resultSeq = matchingResult!.sequence;
      const turnCompletedSeq = turnCompletions[0].sequence;

      // Tool dispatch should come after turn start
      expect(turnStartSeq).toBeLessThan(toolDispatchSeq);

      // Workflow queued should come after tool dispatch
      expect(toolDispatchSeq).toBeLessThan(workflowQueuedSeq);

      // Async tracked should come after workflow queued
      expect(workflowQueuedSeq).toBeLessThan(asyncTrackedSeq);

      // Async waiting should come after tracked (sync tool waits)
      expect(asyncTrackedSeq).toBeLessThan(asyncWaitingSeq);

      // Result should come after waiting (workflow completed and delivered result)
      expect(asyncWaitingSeq).toBeLessThan(resultSeq);

      // Async resumed should come after result is recorded (resume marks completion)
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
      console.log(`   Workflow queued: ${workflowQueued.length}`);
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
        agentId: createdResources.agentId ?? '',
        personaId: createdResources.personaId ?? '',
        createdResources: {
          toolIds: createdResources.toolIds,
          taskIds: createdResources.taskIds,
          workflowIds: createdResources.workflowIds,
        },
      };
      await cleanupConversationTest(setup);
      console.log('Cleanup complete');
    }
  });
});
