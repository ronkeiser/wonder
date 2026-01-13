/**
 * Conversation Test 01: Single Turn, No Tools
 *
 * Validates the basic conversation lifecycle:
 * 1. Turn creation and status transitions
 * 2. Context assembly workflow dispatch and callback
 * 3. LLM call and response handling
 * 4. Move creation (single iteration)
 * 5. Memory extraction workflow dispatch
 * 6. Turn completion
 *
 * This is the foundation test - all other conversation tests build on this.
 */

import { describe, expect, it } from 'vitest';
import { assertConversationInvariants, runTestConversation } from '~/kit';

describe('Conversation: 01 - Single Turn, No Tools', () => {
  it('executes single turn with correct lifecycle', async () => {
    // =========================================================================
    // SETUP: Define persona (no tools for this test)
    // =========================================================================
    const personaConfig = {
      name: 'Test Assistant',
      systemPrompt: 'You are a helpful assistant. Respond briefly.',
    };

    // =========================================================================
    // EXECUTE: Run conversation with single user message
    // =========================================================================
    const { result, cleanup } = await runTestConversation(
      personaConfig,
      [{ role: 'user', content: 'Hello! Please respond with a brief greeting.' }],
      { logEvents: true },
    );

    try {
      // =======================================================================
      // ASSERT: Basic execution success
      // =======================================================================
      expect(result.status).toBe('completed');
      expect(result.turnIds).toHaveLength(1);

      const { trace } = result;

      // =======================================================================
      // ASSERT: Structural invariants
      // =======================================================================
      assertConversationInvariants(trace);

      // =======================================================================
      // ASSERT: Turn lifecycle
      // =======================================================================

      // Turn should be created
      const turnStarts = trace.turns.starts();
      expect(turnStarts).toHaveLength(1);

      const turnStart = turnStarts[0];
      expect(turnStart.payload.turnId).toBe(result.turnIds[0]);

      // Turn should complete
      const turnCompletions = trace.turns.completions();
      expect(turnCompletions).toHaveLength(1);

      const turnCompletion = turnCompletions[0];
      expect(turnCompletion.payload.turnId).toBe(result.turnIds[0]);

      // =======================================================================
      // ASSERT: Context assembly workflow
      // =======================================================================

      // Context assembly should be dispatched
      const contextAssemblyDispatches = trace.contextAssembly.dispatches();
      expect(contextAssemblyDispatches.length).toBeGreaterThanOrEqual(1);

      // =======================================================================
      // ASSERT: LLM loop
      // =======================================================================

      // LLM should be called
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(1);

      // LLM should respond
      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(1);

      // Response should have text (no tool use for this test)
      const llmResponse = llmResponses[0];
      expect(llmResponse.payload.hasText).toBe(true);
      expect(llmResponse.payload.toolCallCount).toBe(0);

      // =======================================================================
      // ASSERT: Move creation
      // =======================================================================

      // At least one move should be created (the LLM response)
      const moves = trace.moves.all();
      expect(moves.length).toBeGreaterThanOrEqual(1);

      // =======================================================================
      // ASSERT: Messages
      // =======================================================================

      // User message should be appended
      const userMessages = trace.messages.user();
      expect(userMessages.length).toBeGreaterThanOrEqual(1);

      // Agent message should be appended
      const agentMessages = trace.messages.agent();
      expect(agentMessages.length).toBeGreaterThanOrEqual(1);

      // =======================================================================
      // ASSERT: Causal ordering
      // =======================================================================

      // Events should follow causal order:
      // turn.created < context_assembly.dispatched < llm.calling < llm.response < turn.completed

      const turnStartSeq = turnStart.sequence;
      const contextAssemblySeq = contextAssemblyDispatches[0].sequence;
      const llmCallSeq = llmCalls[0].sequence;
      const llmResponseSeq = llmResponses[0].sequence;
      const turnCompletedSeq = turnCompletion.sequence;

      expect(turnStartSeq).toBeLessThan(contextAssemblySeq);
      expect(contextAssemblySeq).toBeLessThan(llmCallSeq);
      expect(llmCallSeq).toBeLessThan(llmResponseSeq);
      expect(llmResponseSeq).toBeLessThan(turnCompletedSeq);

      // =======================================================================
      // ASSERT: Event manifest (count by type)
      // =======================================================================
      console.log('\n📊 Event Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   Context assembly dispatches: ${contextAssemblyDispatches.length}`);
      console.log(`   LLM calls: ${llmCalls.length}`);
      console.log(`   LLM responses: ${llmResponses.length}`);
      console.log(`   Moves: ${moves.length}`);
      console.log(`   User messages: ${userMessages.length}`);
      console.log(`   Agent messages: ${agentMessages.length}`);
      console.log(`   Total trace events: ${result.traceEvents.length}`);
    } finally {
      // =======================================================================
      // CLEANUP
      // =======================================================================
      await cleanup();
    }
  });
});
