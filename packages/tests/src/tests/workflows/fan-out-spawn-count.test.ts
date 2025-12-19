import {
  action,
  node,
  promptSpec,
  schema as s,
  step,
  task,
  transition,
  workflow,
} from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

/**
 * Fan-Out Trivia Questions Test
 *
 * Tests the coordinator's spawn_count feature to generate multiple trivia questions.
 *
 * Workflow structure:
 *   [start_node] --(spawn_count: 3)--> [question_node] --> [collect_node] --> (complete)
 *
 * Data flow:
 * - Start node: receives topic input
 * - Question node (3 instances): each generates a unique trivia question + answer
 * - Collect node: waits for all 3, merges questions into array
 *
 * This proves:
 * 1. Spawn count: single transition creates 3 identical tokens
 * 2. Branch isolation: each question generator writes to separate branch
 * 3. Synchronization: collect node waits for all siblings
 * 4. Merge strategy: append collects all 3 Q&A pairs into array
 */
describe('Coordinator - Fan-Out Trivia Questions', () => {
  it('spawns 3 question generators and collects all Q&A pairs', async () => {
    const inputData = { topic: 'space exploration' };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ topic: s.string() }, { required: ['topic'] });

    // Each question node outputs a question and answer
    const questionSchema = s.object(
      {
        question: s.string(),
        answer: s.string(),
      },
      { required: ['question', 'answer'] },
    );

    // Workflow output
    const workflowOutputSchema = s.object(
      {
        topic: s.string(),
        trivia: s.array(
          s.object(
            { question: s.string(), answer: s.string() },
            { required: ['question', 'answer'] },
          ),
        ),
      },
      { required: ['topic', 'trivia'] },
    );

    // =========================================================================
    // Start Node - Pure placeholder, does nothing
    // =========================================================================
    const startAction = action({
      name: 'Start Action',
      description: 'No-op',
      kind: 'update_context',
      implementation: {},
    });

    const startStep = step({
      ref: 'start_step',
      ordinal: 0,
      action: startAction,
      input_mapping: {},
      output_mapping: {},
    });

    const startTask = task({
      name: 'Start Task',
      description: 'No-op',
      input_schema: s.object({}),
      output_schema: s.object({}),
      steps: [startStep],
    });

    const startNode = node({
      ref: 'start_node',
      name: 'Start',
      task: startTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {},
    });

    // =========================================================================
    // Question Node - Generates trivia Q&A (will be spawned 3 times)
    // =========================================================================
    const questionPrompt = promptSpec({
      name: 'Question Prompt',
      description: 'Generates a trivia question and answer',
      template: `Generate a unique and interesting trivia question about {{topic}}.

Make sure the question is specific and factual, not too easy or too hard.

Return JSON with:
- "question": the trivia question (end with a question mark)
- "answer": the correct answer (brief, 1-2 sentences max)`,
      template_language: 'handlebars',
      requires: { topic: s.string() },
      produces: questionSchema,
    });

    const questionAction = action({
      name: 'Question Action',
      description: 'Generates Q&A',
      kind: 'llm_call',
      implementation: { prompt_spec: questionPrompt },
    });

    const questionStep = step({
      ref: 'question_step',
      ordinal: 0,
      action: questionAction,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: {
        'output.question': '$.response.question',
        'output.answer': '$.response.answer',
      },
    });

    const questionTask = task({
      name: 'Question Task',
      description: 'Task that generates trivia Q&A',
      input_schema: s.object({ topic: s.string() }, { required: ['topic'] }),
      output_schema: questionSchema,
      steps: [questionStep],
    });

    const questionNode = node({
      ref: 'question_node',
      name: 'Generate Question',
      task: questionTask,
      task_version: 1,
      input_mapping: { topic: '$.input.topic' }, // Read directly from input
      // Branch output - each instance writes to branch_output_{token_id}
      output_mapping: {
        'output.question': '$.question',
        'output.answer': '$.answer',
      },
    });

    // =========================================================================
    // Collect Node - Pure placeholder, does nothing
    // The merge already wrote data to output.trivia
    // =========================================================================
    const collectAction = action({
      name: 'Collect Action',
      description: 'No-op',
      kind: 'update_context',
      implementation: {},
    });

    const collectStep = step({
      ref: 'collect_step',
      ordinal: 0,
      action: collectAction,
      input_mapping: {},
      output_mapping: {},
    });

    const collectTask = task({
      name: 'Collect Task',
      description: 'No-op',
      input_schema: s.object({}),
      output_schema: s.object({}),
      steps: [collectStep],
    });

    const collectNode = node({
      ref: 'collect_node',
      name: 'Collect Trivia',
      task: collectTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {},
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const startToQuestion = transition({
      ref: 'start_to_question',
      from_node_ref: 'start_node',
      to_node_ref: 'question_node',
      priority: 1,
      spawn_count: 3, // KEY: Creates 3 sibling tokens
    });

    const questionToCollect = transition({
      ref: 'question_to_collect',
      from_node_ref: 'question_node',
      to_node_ref: 'collect_node',
      priority: 1,
      synchronization: {
        strategy: 'all', // Wait for all 3 siblings
        sibling_group: 'start_to_question', // Match tokens from spawn_count transition
        merge: {
          source: '_branch.output', // Extract full output (question + answer) from each branch
          target: 'output.trivia', // Write merged array to output
          strategy: 'append', // Collect into array
        },
      },
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Fan-Out Trivia Questions',
        description: 'Tests spawn_count to generate multiple trivia questions',
        input_schema: inputSchema,
        context_schema: s.object({}),
        output_schema: workflowOutputSchema,
        output_mapping: {
          topic: '$.input.topic',
          trivia: '$.output.trivia',
        },
        initial_node_ref: 'start_node',
        nodes: [startNode, questionNode, collectNode],
        transitions: [startToQuestion, questionToCollect],
      }),
      inputData,
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Fan-Out Trivia Questions Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Correct number of tokens:
    // - 1 start_node
    // - 3 question_node (spawned by fan-out)
    // - 3 collect_node waiting tokens (one per arriving sibling at sync point)
    // - 1 collect_node continuation token (after fan-in activates)
    const tokenCreations = trace.tokens.creations();
    console.log(`  Token creations (${tokenCreations.length}):`);
    for (const tc of tokenCreations) {
      console.log(
        `    - node_id: ${tc.node_id}, branch_index: ${tc.payload.branch_index}, sibling_group: ${tc.payload.sibling_group}`,
      );
    }
    expect(tokenCreations.length).toBe(8);
    console.log(`  ✓ ${tokenCreations.length} tokens created`);

    // 3. Verify spawn_count in routing (fan-out creates 3 question tokens)
    const routingMatches = trace.routing.matches();
    const fanOutRouting = routingMatches.find((m) => m.payload.spawn_count === 3);
    expect(fanOutRouting).toBeDefined();
    console.log('  ✓ Spawn count: 3 tokens created from single transition');

    // 4. Verify all 3 question generators share sibling_group
    // Filter to get tokens with a sibling_group (fan-out tokens)
    const fanOutTokens = tokenCreations.filter((t) => t.payload.sibling_group !== null);
    // Group by sibling_group to find the question node tokens
    const tokensBySiblingGroup = new Map<string, typeof fanOutTokens>();
    for (const t of fanOutTokens) {
      const group = t.payload.sibling_group!;
      if (!tokensBySiblingGroup.has(group)) {
        tokensBySiblingGroup.set(group, []);
      }
      tokensBySiblingGroup.get(group)!.push(t);
    }
    // The question_node tokens are those with 3 distinct branch indices (0, 1, 2)
    const questionTokens = Array.from(tokensBySiblingGroup.values()).find(
      (tokens) =>
        tokens.length === 3 && new Set(tokens.map((t) => t.payload.branch_index)).size === 3,
    );
    expect(questionTokens).toBeDefined();

    const siblingGroups = questionTokens!.map((t) => t.payload.sibling_group);
    const uniqueSiblingGroups = new Set(siblingGroups.filter((g) => g !== null));
    expect(uniqueSiblingGroups.size).toBe(1);
    console.log('  ✓ All 3 question generators share same sibling_group');

    // 5. Verify branch indices (should have 0, 1, 2)
    const branchIndices = questionTokens!.map((t) => t.payload.branch_index).sort();
    expect(branchIndices).toEqual([0, 1, 2]);
    console.log('  ✓ Branch indices: 0-2');

    // 6. Verify branch_total
    const branchTotals = questionTokens!.map((t) => t.payload.branch_total);
    expect(branchTotals.every((total) => total === 3)).toBe(true);
    console.log('  ✓ Branch total: 3 for all question generators');

    // 7. Extract trivia from final output
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      topic: string;
      trivia: Array<{ question: string; answer: string }>;
    };

    expect(finalOutput.trivia).toBeDefined();
    expect(finalOutput.trivia.length).toBe(3);
    console.log(`\n  📚 Generated ${finalOutput.trivia.length} trivia questions:\n`);

    finalOutput.trivia.forEach((qa, idx) => {
      console.log(`  Q${idx + 1}: ${qa.question}`);
      console.log(`  A${idx + 1}: ${qa.answer}\n`);
    });

    // 8. Verify all trivia items have question and answer
    const allValid = finalOutput.trivia.every(
      (qa) =>
        typeof qa.question === 'string' &&
        qa.question.length > 0 &&
        typeof qa.answer === 'string' &&
        qa.answer.length > 0,
    );
    expect(allValid).toBe(true);
    console.log('  ✓ All trivia items have valid question and answer');

    // 9. Verify topic is preserved
    expect(finalOutput.topic).toBe(inputData.topic);
    console.log(`  ✓ Topic preserved: "${finalOutput.topic}"`);

    // 10. All tokens completed
    for (let i = 0; i < tokenCreations.length; i++) {
      const statuses = trace.tokens.statusTransitions(tokenCreations[i].token_id!);
      expect(statuses).toContain('completed');
    }
    console.log('  ✓ All tokens completed successfully');

    console.log('\n✅ Fan-out trivia generation complete - 3 unique Q&A pairs collected\n');

    await cleanup();
  });
});
