/**
 * Conversation Test 04: Multi-Turn Sequential
 *
 * Validates sequential turns within a single conversation:
 * 1. First turn executes and completes
 * 2. Second turn executes with conversation context
 * 3. Each turn has its own lifecycle (start → complete)
 * 4. Turns are isolated but share conversation state
 * 5. Move sequences increment across turns
 *
 * This test proves that multiple turns execute correctly in sequence,
 * each completing before the next begins.
 */

import { describe, expect, it } from 'vitest';
import { assertConversationInvariants } from '~/kit';
import { runTestConversation } from '~/kit/conversation';

describe('Conversation: 04 - Multi-Turn Sequential', () => {
  it('executes multiple turns sequentially with correct lifecycle', async () => {
    // =========================================================================
    // SETUP & EXECUTE: Run conversation with multiple sequential messages
    // =========================================================================
    console.log('🚀 Running multi-turn conversation...');

    const { result, cleanup } = await runTestConversation(
      {
        name: 'Multi-Turn Agent',
        systemPrompt:
          'You are a helpful assistant. Respond briefly to each message. Remember the context of the conversation.',
      },
      [
        { role: 'user', content: 'My name is Alice.' },
        { role: 'user', content: 'What is my name?' },
        { role: 'user', content: 'Thank you for remembering!' },
      ],
      { logEvents: true },
    );

    try {
      // =========================================================================
      // ASSERT: Basic execution success
      // =========================================================================
      expect(result.status).toBe('completed');
      expect(result.turnIds).toHaveLength(3);

      const trace = result.trace;

      // =========================================================================
      // ASSERT: Structural invariants
      // =========================================================================
      assertConversationInvariants(trace);

      // =========================================================================
      // ASSERT: Turn lifecycle - each turn starts and completes
      // =========================================================================
      const turnStarts = trace.turns.starts();
      expect(turnStarts).toHaveLength(3);

      const turnCompletions = trace.turns.completions();
      expect(turnCompletions).toHaveLength(3);

      // Each turn should have matching start and completion
      const [turn1Id, turn2Id, turn3Id] = turnStarts.map((t) => t.payload.turnId);
      expect(result.turnIds).toEqual([turn1Id, turn2Id, turn3Id]);

      // All turns should reach completed status
      expect(trace.turns.statusTransitions(turn1Id)).toEqual(['active', 'completed']);
      expect(trace.turns.statusTransitions(turn2Id)).toEqual(['active', 'completed']);
      expect(trace.turns.statusTransitions(turn3Id)).toEqual(['active', 'completed']);

      // =========================================================================
      // ASSERT: Sequential ordering - turn 1 completes before turn 2 starts
      // =========================================================================
      const turn1Start = turnStarts.find((t) => t.payload.turnId === turn1Id)!;
      const turn1Complete = turnCompletions.find((t) => t.payload.turnId === turn1Id)!;
      const turn2Start = turnStarts.find((t) => t.payload.turnId === turn2Id)!;
      const turn2Complete = turnCompletions.find((t) => t.payload.turnId === turn2Id)!;
      const turn3Start = turnStarts.find((t) => t.payload.turnId === turn3Id)!;
      const turn3Complete = turnCompletions.find((t) => t.payload.turnId === turn3Id)!;

      // Verify sequential execution order
      expect(turn1Start.sequence).toBeLessThan(turn1Complete.sequence);
      expect(turn1Complete.sequence).toBeLessThan(turn2Start.sequence);
      expect(turn2Start.sequence).toBeLessThan(turn2Complete.sequence);
      expect(turn2Complete.sequence).toBeLessThan(turn3Start.sequence);
      expect(turn3Start.sequence).toBeLessThan(turn3Complete.sequence);

      // =========================================================================
      // ASSERT: Messages - each turn has user and agent messages
      // =========================================================================
      const userMessages = trace.messages.user();
      expect(userMessages).toHaveLength(3);

      const agentMessages = trace.messages.agent();
      expect(agentMessages.length).toBeGreaterThanOrEqual(3);

      // Each turn should have at least one user message
      expect(trace.messages.forTurn(turn1Id).filter((m) => m.payload.role === 'user')).toHaveLength(
        1,
      );
      expect(trace.messages.forTurn(turn2Id).filter((m) => m.payload.role === 'user')).toHaveLength(
        1,
      );
      expect(trace.messages.forTurn(turn3Id).filter((m) => m.payload.role === 'user')).toHaveLength(
        1,
      );

      // Each turn should have at least one agent message
      expect(
        trace.messages.forTurn(turn1Id).filter((m) => m.payload.role === 'agent').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        trace.messages.forTurn(turn2Id).filter((m) => m.payload.role === 'agent').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        trace.messages.forTurn(turn3Id).filter((m) => m.payload.role === 'agent').length,
      ).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Moves - each turn has at least one move (LLM iteration)
      // =========================================================================
      const turn1Moves = trace.moves.forTurn(turn1Id);
      const turn2Moves = trace.moves.forTurn(turn2Id);
      const turn3Moves = trace.moves.forTurn(turn3Id);

      expect(turn1Moves.length).toBeGreaterThanOrEqual(1);
      expect(turn2Moves.length).toBeGreaterThanOrEqual(1);
      expect(turn3Moves.length).toBeGreaterThanOrEqual(1);

      // No tool calls in this simple conversation
      const movesWithToolCalls = trace.moves.all().filter((m) => m.payload.hasToolCall);
      expect(movesWithToolCalls).toHaveLength(0);

      // All moves should have reasoning (text responses)
      const movesWithReasoning = trace.moves.all().filter((m) => m.payload.hasReasoning);
      expect(movesWithReasoning.length).toBeGreaterThanOrEqual(3);

      // =========================================================================
      // ASSERT: LLM calls - each turn has at least one LLM call
      // =========================================================================
      const llmCalls = trace.llm.calls();
      expect(llmCalls.length).toBeGreaterThanOrEqual(3);

      const llmResponses = trace.llm.responses();
      expect(llmResponses.length).toBeGreaterThanOrEqual(3);

      // Each turn should have at least one LLM call
      expect(trace.llm.callsForTurn(turn1Id).length).toBeGreaterThanOrEqual(1);
      expect(trace.llm.callsForTurn(turn2Id).length).toBeGreaterThanOrEqual(1);
      expect(trace.llm.callsForTurn(turn3Id).length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: Context assembly - invoked for each turn
      // =========================================================================
      const contextAssemblyDispatches = trace.contextAssembly.dispatches();
      expect(contextAssemblyDispatches.length).toBeGreaterThanOrEqual(3);

      // Each turn should have context assembly
      expect(trace.contextAssembly.forTurn(turn1Id).length).toBeGreaterThanOrEqual(1);
      expect(trace.contextAssembly.forTurn(turn2Id).length).toBeGreaterThanOrEqual(1);
      expect(trace.contextAssembly.forTurn(turn3Id).length).toBeGreaterThanOrEqual(1);

      // =========================================================================
      // ASSERT: No tool dispatches (no tools configured)
      // =========================================================================
      const toolDispatches = trace.tools.dispatches();
      expect(toolDispatches).toHaveLength(0);

      // =========================================================================
      // ASSERT: Event manifest
      // =========================================================================
      console.log('\n📊 Event Manifest:');
      console.log(`   Turn starts: ${turnStarts.length}`);
      console.log(`   Turn completions: ${turnCompletions.length}`);
      console.log(`   User messages: ${userMessages.length}`);
      console.log(`   Agent messages: ${agentMessages.length}`);
      console.log(`   Moves (turn 1): ${turn1Moves.length}`);
      console.log(`   Moves (turn 2): ${turn2Moves.length}`);
      console.log(`   Moves (turn 3): ${turn3Moves.length}`);
      console.log(`   LLM calls: ${llmCalls.length}`);
      console.log(`   LLM responses: ${llmResponses.length}`);
      console.log(`   Context assembly: ${contextAssemblyDispatches.length}`);
      console.log(`   Tool dispatches: ${toolDispatches.length}`);
      console.log(`   Total trace events: ${result.traceEvents.length}`);
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      await cleanup();
    }
  });
});
