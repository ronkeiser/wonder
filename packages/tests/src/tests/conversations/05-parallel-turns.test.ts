/**
 * Conversation Test 05: Parallel Turns
 *
 * Validates concurrent active turns with interleaved async operations:
 * 1. Turn A starts with async tool dispatch (stays active waiting)
 * 2. Turn B starts while Turn A is still active
 * 3. Turn B completes quickly (no async operations)
 * 4. Turn A completes after async operation finishes
 * 5. Turn B completion happens BEFORE Turn A completion (out-of-order)
 *
 * This test proves that:
 * - Multiple turns can be active simultaneously
 * - Turns complete independently based on their pending work
 * - The conversation correctly tracks multiple active turns
 *
 * Uses WebSocket for event collection - essential for concurrent turns
 * since each SSE stream terminates when its turn completes.
 */

import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertConversationInvariants, executeConversation } from '~/kit';
import { setupTestContext } from '~/kit/context';
import { cleanupConversationTest } from '~/kit/conversation';
import { wonder } from '~/client';
import { createWorkflow } from '~/kit/workflow';

describe('Conversation: 05 - Parallel Turns', () => {
  it('handles multiple active turns with async operations completing out of order', async () => {
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
      personaId: undefined as string | undefined,
      agentId: undefined as string | undefined,
    };

    try {
      // =========================================================================
      // SETUP: Create a SLOW async workflow (for Turn A)
      // =========================================================================
      console.log('📦 Creating slow research workflow (async tool target)...');

      const researchOutputSchema = s.object(
        { findings: s.string(), sources: s.array(s.string()) },
        { required: ['findings', 'sources'] },
      );

      const researchAction = action({
        name: 'Research Action',
        description: 'Simulates slow research',
        kind: 'mock',
        implementation: {
          schema: researchOutputSchema,
          options: {
            // Delay ensures Turn A stays active while Turn B completes
            delay: { minMs: 4000, maxMs: 5000 },
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
        description: 'Performs slow research',
        inputSchema: s.object({ topic: s.string() }),
        outputSchema: researchOutputSchema,
        steps: [researchStep],
      });

      const researchNode = node({
        ref: 'research',
        name: 'Research',
        task: researchTask,
        taskVersion: 1,
        inputMapping: { topic: 'input.topic' },
        outputMapping: {
          'output.findings': 'result.findings',
          'output.sources': 'result.sources',
        },
      });

      const researchWorkflow = workflow({
        name: 'Slow Research Workflow',
        description: 'Async research workflow with delay',
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
      // SETUP: Create context assembly workflow (single-line system prompt)
      // =========================================================================
      console.log('📦 Creating context assembly passthrough workflow...');

      // Single-line system prompt to avoid expression parsing issues
      const systemPrompt =
        'You are an assistant. Use the research tool for research questions. For simple math like 2+2, answer directly.';

      const contextAction = action({
        name: 'Build LLM Request',
        description: 'Builds minimal LLM request from user message',
        kind: 'context',
        implementation: {},
      });

      const buildRequestStep = step({
        ref: 'build_request',
        ordinal: 0,
        action: contextAction,
        inputMapping: { userMessage: 'input.userMessage' },
        outputMapping: {
          'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${systemPrompt}' }`,
        },
      });

      const messageSchema = s.object({ role: s.string(), content: s.string() });
      const llmRequestSchema = s.object({
        messages: s.array(messageSchema),
        systemPrompt: s.string(),
      });

      const buildRequestTask = task({
        name: 'Context Assembly Passthrough',
        description: 'Builds LLM request from user message',
        inputSchema: s.object({ userMessage: s.string() }),
        outputSchema: s.object({ llmRequest: llmRequestSchema }),
        steps: [buildRequestStep],
      });

      const buildRequestNode = node({
        ref: 'build_request',
        name: 'Build Request',
        task: buildRequestTask,
        taskVersion: 1,
        inputMapping: { userMessage: 'input.userMessage' },
        outputMapping: { 'output.llmRequest': 'result.llmRequest' },
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
        outputSchema: s.object({ llmRequest: llmRequestSchema }),
        outputMapping: { llmRequest: 'output.llmRequest' },
        initialNodeRef: 'build_request',
        nodes: [buildRequestNode],
        transitions: [],
      });

      const contextAssemblySetup = await createWorkflow(ctx, contextAssemblyWorkflow);
      createdResources.workflowIds.push(contextAssemblySetup.workflowId);
      createdResources.taskIds.push(...contextAssemblySetup.createdResources.taskIds);
      createdResources.actionIds.push(...contextAssemblySetup.createdResources.actionIds);
      console.log(`   Created context assembly workflow: ${contextAssemblySetup.workflowId}`);

      // Memory extraction noop
      console.log('📦 Creating memory extraction noop workflow...');
      const noopAction = action({
        name: 'Noop',
        description: 'Does nothing',
        kind: 'context',
        implementation: {},
      });

      const noopStep = step({
        ref: 'noop',
        ordinal: 0,
        action: noopAction,
        inputMapping: {},
        outputMapping: {},
      });

      const noopTask = task({
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
      console.log(`   Created memory extraction workflow: ${memoryExtractionSetup.workflowId}`);

      // =========================================================================
      // SETUP: Create async research tool
      // =========================================================================
      console.log('🔧 Creating research tool (async)...');
      const toolResponse = await wonder.tools.create({
        name: 'research',
        description: 'Research a topic (async operation). Use for research questions.',
        inputSchema: {
          type: 'object',
          properties: { topic: { type: 'string', description: 'The topic to research' } },
          required: ['topic'],
        },
        targetType: 'workflow',
        targetId: researchWorkflowSetup.workflowDefId,
        async: true,
      });
      createdResources.toolIds.push(toolResponse.toolId);
      console.log(`   Created tool: ${toolResponse.toolId}`);

      // =========================================================================
      // SETUP: Create persona, agent, conversation
      // =========================================================================
      console.log('👤 Creating persona...');
      const personaResponse = await wonder.personas.create({
        name: 'Multi-tasker Agent',
        description: 'Test agent for parallel turns',
        systemPrompt,
        modelProfileId: ctx.modelProfileId,
        contextAssemblyWorkflowDefId: contextAssemblySetup.workflowDefId,
        memoryExtractionWorkflowDefId: memoryExtractionSetup.workflowDefId,
        toolIds: [toolResponse.toolId],
        recentTurnsLimit: 10,
      });
      createdResources.personaId = personaResponse.personaId;
      console.log(`   Created persona: ${personaResponse.personaId}`);

      console.log('🤖 Creating agent...');
      const agentResponse = await wonder.agents.create({
        name: 'Parallel Turns Agent',
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
      // EXECUTE: Send two messages in rapid succession (parallel turns)
      // =========================================================================
      console.log('🚀 Starting parallel turn execution via WebSocket...');

      // Turn A: Research request (will use async tool, stays active ~4-5s)
      // Turn B: Simple question (no tool, completes quickly)
      //
      // The delay ensures Turn A dispatches its async tool before Turn B starts.
      const result = await executeConversation(
        conversationId,
        [
          { role: 'user', content: 'Please research quantum computing fundamentals' },
          { role: 'user', content: 'What is 2 + 2?', delayMs: 1000 },
        ],
        { logEvents: true, timeout: 120000 },
      );

      const { traceEvents: allTraceEvents, turnIds, trace } = result;

      // Output debug info
      const apiKey = process.env.API_KEY ?? '$API_KEY';
      console.log('\n📋 Conversation Info:');
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   turnIds: ${turnIds.join(', ')}`);
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
      expect(turnIds.length).toBe(2);

      // =========================================================================
      // ASSERT: Structural invariants
      // =========================================================================
      assertConversationInvariants(trace);

      // =========================================================================
      // ASSERT: Two turns created
      // =========================================================================
      const turnStarts = trace.turns.starts();
      expect(turnStarts).toHaveLength(2);

      const [turnAId, turnBId] = turnStarts.map((t) => t.payload.turnId);
      console.log(`\n📊 Turn Analysis:`);
      console.log(`   Turn A (research): ${turnAId}`);
      console.log(`   Turn B (simple):   ${turnBId}`);

      // =========================================================================
      // ASSERT: Both turns eventually complete
      // =========================================================================
      const turnCompletions = trace.turns.completions();
      expect(turnCompletions).toHaveLength(2);

      expect(trace.turns.statusTransitions(turnAId)).toEqual(['active', 'completed']);
      expect(trace.turns.statusTransitions(turnBId)).toEqual(['active', 'completed']);

      // =========================================================================
      // ASSERT: Turn A has async tool dispatch, Turn B does not
      // =========================================================================
      const turnATools = trace.tools.forTurn(turnAId);
      const turnBTools = trace.tools.forTurn(turnBId);

      expect(turnATools.length).toBeGreaterThanOrEqual(1);
      expect(turnATools.some((t) => t.payload.async === true)).toBe(true);
      expect(turnBTools).toHaveLength(0);

      // =========================================================================
      // ASSERT: Turn B completes BEFORE Turn A (out-of-order completion)
      // =========================================================================
      const turnACompletion = turnCompletions.find((t) => t.payload.turnId === turnAId)!;
      const turnBCompletion = turnCompletions.find((t) => t.payload.turnId === turnBId)!;

      console.log(`   Turn A completion sequence: ${turnACompletion.sequence}`);
      console.log(`   Turn B completion sequence: ${turnBCompletion.sequence}`);

      // This is the KEY assertion: Turn B should complete before Turn A
      expect(turnBCompletion.sequence).toBeLessThan(turnACompletion.sequence);

      // =========================================================================
      // ASSERT: Turn A has async tracking events
      // =========================================================================
      const asyncTrackedEvents = trace
        .all()
        .filter(
          (e) =>
            e.type === 'operation.async.tracked' &&
            (e.payload as { turnId?: string }).turnId === turnAId,
        );
      expect(asyncTrackedEvents.length).toBeGreaterThanOrEqual(1);

      const asyncResumedEvents = trace
        .all()
        .filter(
          (e) =>
            e.type === 'operation.async.resumed' &&
            (e.payload as { turnId?: string }).turnId === turnAId,
        );
      expect(asyncResumedEvents.length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Each turn has its own messages
      // =========================================================================
      const turnAMessages = trace.messages.forTurn(turnAId);
      const turnBMessages = trace.messages.forTurn(turnBId);

      // Turn A: user message + acknowledgment + final result
      expect(turnAMessages.filter((m) => m.payload.role === 'user')).toHaveLength(1);
      expect(turnAMessages.filter((m) => m.payload.role === 'agent').length).toBeGreaterThanOrEqual(
        2,
      );

      // Turn B: user message + direct answer
      expect(turnBMessages.filter((m) => m.payload.role === 'user')).toHaveLength(1);
      expect(turnBMessages.filter((m) => m.payload.role === 'agent').length).toBeGreaterThanOrEqual(
        1,
      );

      // =========================================================================
      // ASSERT: Each turn has context assembly
      // =========================================================================
      expect(trace.contextAssembly.forTurn(turnAId).length).toBeGreaterThanOrEqual(1);
      expect(trace.contextAssembly.forTurn(turnBId).length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Event manifest
      // =========================================================================
      console.log('\n📊 Event Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Turn A messages: ${turnAMessages.length}`);
      console.log(`   Turn B messages: ${turnBMessages.length}`);
      console.log(`   Turn A tools: ${turnATools.length}`);
      console.log(`   Turn B tools: ${turnBTools.length}`);
      console.log(`   Async tracked: ${asyncTrackedEvents.length}`);
      console.log(`   Async resumed: ${asyncResumedEvents.length}`);
      console.log(`   Total trace events: ${allTraceEvents.length}`);
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
