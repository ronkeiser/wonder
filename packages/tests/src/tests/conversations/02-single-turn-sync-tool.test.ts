/**
 * Conversation Test 02: Single Turn, Sync Tool
 *
 * Validates sync tool dispatch within the agent loop:
 * 1. Agent receives user message requesting tool use
 * 2. LLM decides to invoke a tool (sync)
 * 3. Tool dispatch to Executor (task execution)
 * 4. Agent waits for result
 * 5. Result recorded as move
 * 6. LLM continues reasoning with result
 * 7. Agent responds with final message
 *
 * This test proves the sync tool dispatch → wait → resume cycle works correctly.
 */

import { action, schema as s, step, task } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertConversationInvariants } from '~/kit';
import { setupTestContext } from '~/kit/context';
import { createEmbeddedTask } from '~/kit/resources';
import { cleanupConversationTest, executeConversation } from '~/kit/conversation';
import { ConversationTraceEventCollection } from '~/kit/conversation-trace';
import { wonder } from '~/client';
import { createWorkflow } from '~/kit/workflow';
import {
  action as actionBuilder,
  node,
  step as stepBuilder,
  task as taskBuilder,
  workflow,
} from '@wonder/sdk';

describe('Conversation: 02 - Single Turn, Sync Tool', () => {
  it('dispatches sync tool, waits, resumes with result', async () => {
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
      // SETUP: Create echo task that the tool will target
      // =========================================================================
      console.log('📦 Creating echo task...');

      // The echo task takes text input and returns it as output
      const echoOutputSchema = s.object({ echoed: s.string() }, { required: ['echoed'] });

      const echoAction = action({
        name: 'Echo Action',
        description: 'Echoes the input text back',
        kind: 'mock',
        implementation: { schema: echoOutputSchema },
      });

      const echoStep = step({
        ref: 'echo_step',
        ordinal: 0,
        action: echoAction,
        inputMapping: {},
        outputMapping: { 'output.echoed': 'result.echoed' },
      });

      const echoTask = task({
        name: 'Echo Task',
        description: 'Echoes input text',
        inputSchema: s.object({ text: s.string() }),
        outputSchema: echoOutputSchema,
        steps: [echoStep],
      });

      // Create the task using the test kit helper
      const taskId = await createEmbeddedTask(ctx, echoTask, createdResources);
      console.log(`   Created task: ${taskId}`);

      // =========================================================================
      // SETUP: Create passthrough workflows for context assembly and memory extraction
      // =========================================================================
      console.log('📦 Creating context assembly passthrough workflow...');
      const systemPrompt =
        'You are a helpful assistant with an echo tool. When the user asks you to echo something, use the echo tool to echo it back. After using the tool, respond with the echoed result.';

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

      const buildRequestNode = node({
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

      const contextAssemblyWorkflow = workflow({
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

      const noopNode = node({
        ref: 'noop',
        name: 'Noop',
        task: noopTask,
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      const memoryExtractionWorkflow = workflow({
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
      // SETUP: Create tool that targets the echo task
      // =========================================================================
      console.log('🔧 Creating echo tool...');
      const toolResponse = await wonder.tools.create({
        name: 'echo',
        description: 'Echo back the input text. Use this when asked to echo something.',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        targetType: 'task',
        targetId: taskId,
        async: false, // Sync tool - agent waits for result
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create persona with the echo tool
      // =========================================================================
      console.log('👤 Creating persona...');
      const personaResponse = await wonder.personas.create({
        name: 'Echo Agent',
        description: 'Test agent with echo tool',
        systemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowDefId: contextAssemblySetup.workflowDefId,
        memoryExtractionWorkflowDefId: memoryExtractionSetup.workflowDefId,
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
        name: 'File Reader Agent',
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
      // EXECUTE: Run conversation with message that should trigger tool use
      // =========================================================================
      console.log('🚀 Starting conversation execution...');
      const result = await executeConversation(
        conversationId,
        [{ role: 'user', content: 'Please echo: hello world' }],
        { logEvents: true },
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
      // ASSERT: Tool dispatch (sync)
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches.length).toBeGreaterThanOrEqual(1);

      // Should be a sync dispatch (not async)
      const syncDispatches = trace.tools.syncDispatches();
      expect(syncDispatches.length).toBeGreaterThanOrEqual(1);

      // Check tool dispatch payload
      const toolDispatch = syncDispatches[0];
      expect(toolDispatch.payload.async).toBe(false);
      expect(toolDispatch.payload.targetType).toBe('task');
      expect(toolDispatch.payload.turnId).toBe(turnId);

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

      // =========================================================================
      // ASSERT: Causal ordering
      // =========================================================================
      // Events should follow causal order:
      // turn.created < context_assembly < llm.calling < llm.response (tool_use) < tool.dispatched < move.result_recorded < llm.calling < llm.response (text) < turn.completed

      const turnStartSeq = turnStarts[0].sequence;
      const toolDispatchSeq = toolDispatch.sequence;
      const resultSeq = matchingResult!.sequence;
      const turnCompletedSeq = turnCompletions[0].sequence;

      // Tool dispatch should come after turn start
      expect(turnStartSeq).toBeLessThan(toolDispatchSeq);

      // Result should come after tool dispatch
      expect(toolDispatchSeq).toBeLessThan(resultSeq);

      // Turn completion should come after result
      expect(resultSeq).toBeLessThan(turnCompletedSeq);

      // =========================================================================
      // ASSERT: Event manifest (count by type)
      // =========================================================================
      console.log('\n📊 Event Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Tool dispatches: ${toolDispatches.length}`);
      console.log(`   Sync dispatches: ${syncDispatches.length}`);
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
      console.log('🧹 Starting cleanup...');
      const setup = {
        ...ctx,
        conversationId: '', // Will be set if we got that far
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