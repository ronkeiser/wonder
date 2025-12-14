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
 * Fan-Out Spawn Count Workflow Test
 *
 * Tests the coordinator's spawn_count feature with branch isolation and merge.
 *
 * Workflow structure:
 *   [question_node] --(spawn_count: 5)--> [judge_node] --> [aggregate_node] --> (complete)
 *
 * Data flow:
 * - Question node: generates a trivia question
 * - Judge node (5 instances): each evaluates the question difficulty (1-10)
 * - Aggregate node: waits for all 5, merges ratings into array
 *
 * This proves:
 * 1. Spawn count: single transition creates N identical tokens
 * 2. Sibling identification: all 5 share fan_out_transition_id
 * 3. Branch isolation: each judge writes to separate branch_output_{token_id} table
 * 4. Synchronization: aggregate waits for all siblings
 * 5. Merge strategy: append collects all 5 ratings into array
 */
describe('Coordinator - Fan-Out Spawn Count', () => {
  it('spawns 5 judges with spawn_count, isolates branches, and merges results', async () => {
    const inputData = { topic: 'ancient Rome' };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ topic: s.string() }, { required: ['topic'] });

    // Question output
    const questionSchema = s.object({ question: s.string() }, { required: ['question'] });

    // Each judge outputs a rating
    const judgeSchema = s.object(
      { rating: s.number(), reasoning: s.string() },
      { required: ['rating', 'reasoning'] },
    );

    // Aggregate collects all ratings
    const aggregateSchema = s.object(
      {
        ratings: s.array(s.number()),
        average: s.number(),
      },
      { required: ['ratings', 'average'] },
    );

    // Workflow output
    const workflowOutputSchema = s.object(
      {
        question: s.string(),
        ratings: s.array(s.number()),
        average: s.number(),
      },
      { required: ['question', 'ratings', 'average'] },
    );

    // =========================================================================
    // Question Node - Generates trivia question
    // =========================================================================
    const questionPrompt = promptSpec({
      name: 'Question Prompt',
      description: 'Generates trivia question',
      template:
        'Generate a trivia question about {{topic}}. Return JSON with "question": "your question here"',
      template_language: 'handlebars',
      requires: { topic: s.string() },
      produces: questionSchema,
    });

    const questionAction = action({
      name: 'Question Action',
      description: 'Generates question',
      kind: 'llm_call',
      implementation: { prompt_spec: questionPrompt },
    });

    const questionStep = step({
      ref: 'question_step',
      ordinal: 0,
      action: questionAction,
      action_version: 1,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: { 'output.question': '$.response.question' },
    });

    const questionTask = task({
      name: 'Question Task',
      description: 'Task that generates question',
      input_schema: s.object({ topic: s.string() }, { required: ['topic'] }),
      output_schema: questionSchema,
      steps: [questionStep],
    });

    const questionNode = node({
      ref: 'question_node',
      name: 'Generate Question',
      task: questionTask,
      task_version: 1,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: { 'state.question': '$.question' },
    });

    // =========================================================================
    // Judge Node - Rates question difficulty (will be spawned 5 times)
    // =========================================================================
    const judgePrompt = promptSpec({
      name: 'Judge Prompt',
      description: 'Rates question difficulty',
      template: `Rate this trivia question's difficulty from 1-10:

Question: {{question}}

Return JSON with:
- "rating": a number 1-10
- "reasoning": brief explanation (1 sentence)`,
      template_language: 'handlebars',
      requires: { question: s.string() },
      produces: judgeSchema,
    });

    const judgeAction = action({
      name: 'Judge Action',
      description: 'Rates difficulty',
      kind: 'llm_call',
      implementation: { prompt_spec: judgePrompt },
    });

    const judgeStep = step({
      ref: 'judge_step',
      ordinal: 0,
      action: judgeAction,
      action_version: 1,
      input_mapping: { question: '$.input.question' },
      output_mapping: {
        'output.rating': '$.response.rating',
        'output.reasoning': '$.response.reasoning',
      },
    });

    const judgeTask = task({
      name: 'Judge Task',
      description: 'Task that rates question',
      input_schema: s.object({ question: s.string() }, { required: ['question'] }),
      output_schema: judgeSchema,
      steps: [judgeStep],
    });

    const judgeNode = node({
      ref: 'judge_node',
      name: 'Judge',
      task: judgeTask,
      task_version: 1,
      input_mapping: { question: '$.state.question' },
      // Branch output - each judge writes to branch_output_{token_id}
      output_mapping: {
        'output.rating': '$.rating',
        'output.reasoning': '$.reasoning',
      },
    });

    // =========================================================================
    // Aggregate Node - Collects all ratings and computes average
    // =========================================================================
    const aggregatePrompt = promptSpec({
      name: 'Aggregate Prompt',
      description: 'Aggregates ratings',
      template: `You received {{ratings.length}} difficulty ratings for a trivia question.

Ratings: {{#each ratings}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}

Calculate the average and return JSON with:
- "ratings": [{{#each ratings}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}]
- "average": the calculated average`,
      template_language: 'handlebars',
      requires: { ratings: s.array(s.number()) },
      produces: aggregateSchema,
    });

    const aggregateAction = action({
      name: 'Aggregate Action',
      description: 'Aggregates ratings',
      kind: 'llm_call',
      implementation: { prompt_spec: aggregatePrompt },
    });

    const aggregateStep = step({
      ref: 'aggregate_step',
      ordinal: 0,
      action: aggregateAction,
      action_version: 1,
      input_mapping: { ratings: '$.input.ratings' },
      output_mapping: {
        'output.ratings': '$.response.ratings',
        'output.average': '$.response.average',
      },
    });

    const aggregateTask = task({
      name: 'Aggregate Task',
      description: 'Task that aggregates ratings',
      input_schema: s.object({ ratings: s.array(s.number()) }, { required: ['ratings'] }),
      output_schema: aggregateSchema,
      steps: [aggregateStep],
    });

    const aggregateNode = node({
      ref: 'aggregate_node',
      name: 'Aggregate Ratings',
      task: aggregateTask,
      task_version: 1,
      input_mapping: { ratings: '$.state.all_ratings' },
      output_mapping: {
        'output.ratings': '$.ratings',
        'output.average': '$.average',
      },
    });

    // =========================================================================
    // Transitions - spawn_count for fan-out, synchronization for fan-in
    // =========================================================================
    const questionToJudge = transition({
      ref: 'question_to_judge',
      from_node_ref: 'question_node',
      to_node_ref: 'judge_node',
      priority: 1,
      spawn_count: 5, // KEY: Creates 5 sibling tokens
    });

    const judgeToAggregate = transition({
      ref: 'judge_to_aggregate',
      from_node_ref: 'judge_node',
      to_node_ref: 'aggregate_node',
      priority: 1,
      synchronization: {
        strategy: 'all', // Wait for all 5 siblings
        sibling_group: 'question_to_judge', // Match tokens from spawn_count transition
        merge: {
          source: '_branch.output.rating', // Extract rating from each branch
          target: 'state.all_ratings', // Write merged array to state
          strategy: 'append', // Collect into array
        },
      },
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: `Fan-Out Spawn Count ${Date.now()}`,
        description: 'Tests spawn_count with branch isolation and merge',
        input_schema: inputSchema,
        context_schema: s.object({
          question: s.string(),
          all_ratings: s.array(s.number()),
        }),
        output_schema: workflowOutputSchema,
        output_mapping: {
          question: '$.state.question',
          ratings: '$.output.ratings',
          average: '$.output.average',
        },
        initial_node_ref: 'question_node',
        nodes: [questionNode, judgeNode, aggregateNode],
        transitions: [questionToJudge, judgeToAggregate],
      }),
      inputData,
      { logEvents: false },
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Fan-Out Spawn Count Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Correct number of tokens: 1 question + 5 judges + 1 aggregate
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations.length).toBe(7);
    console.log(
      `  ✓ ${tokenCreations.length} tokens created (1 question + 5 judges + 1 aggregate)`,
    );

    // 3. Verify spawn_count in routing
    const routingMatches = trace.routing.matches();
    const questionRouting = routingMatches.find((m) =>
      m.payload.transition_id?.includes('question_to_judge'),
    );
    expect(questionRouting).toBeDefined();
    expect(questionRouting?.payload.spawn_count).toBe(5);
    console.log('  ✓ Spawn count: 5 tokens created from single transition');

    // 4. Verify all 5 judges share fan_out_transition_id
    const judgeTokens = tokenCreations.slice(1, 6); // Tokens 2-6 are judges
    const fanOutIds = judgeTokens.map((t) => t.payload.fan_out_transition_id);
    const uniqueFanOutIds = new Set(fanOutIds.filter((id) => id !== null));
    expect(uniqueFanOutIds.size).toBe(1);
    console.log('  ✓ All 5 judges share same fan_out_transition_id');

    // 5. Verify branch indices
    const branchIndices = judgeTokens.map((t) => t.payload.branch_index);
    expect(branchIndices).toEqual([0, 1, 2, 3, 4]);
    console.log('  ✓ Branch indices: 0-4');

    // 6. Verify branch_total
    const branchTotals = judgeTokens.map((t) => t.payload.branch_total);
    expect(branchTotals.every((total) => total === 5)).toBe(true);
    console.log('  ✓ Branch total: 5 for all judges');

    // 7. Extract ratings from final output
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      question: string;
      ratings: number[];
      average: number;
    };

    expect(finalOutput.ratings).toBeDefined();
    expect(finalOutput.ratings.length).toBe(5);
    console.log(`\n  📊 Ratings: [${finalOutput.ratings.join(', ')}]`);
    console.log(`  📈 Average: ${finalOutput.average}`);

    // 8. Verify all ratings are within valid range
    const allValidRatings = finalOutput.ratings.every((r) => r >= 1 && r <= 10);
    expect(allValidRatings).toBe(true);
    console.log('  ✓ All ratings are 1-10');

    // 9. Verify average is reasonable
    const expectedAvg = finalOutput.ratings.reduce((sum, r) => sum + r, 0) / 5;
    expect(Math.abs(finalOutput.average - expectedAvg)).toBeLessThan(0.1);
    console.log('  ✓ Average calculated correctly');

    // 10. All tokens completed
    for (let i = 0; i < tokenCreations.length; i++) {
      const statuses = trace.tokens.statusTransitions(tokenCreations[i].payload.token_id);
      expect(statuses).toContain('completed');
    }
    console.log('  ✓ All tokens completed successfully');

    console.log('\n✅ Spawn count fan-out complete - branch isolation and merge proven\n');

    await cleanup();
  });
});
