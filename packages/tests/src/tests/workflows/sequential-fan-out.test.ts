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
 * Idea Ranking Test
 *
 * Tests a multi-stage fan-out/fan-in workflow with LLM calls:
 *
 * Workflow structure:
 *   [start] --> [ideate] x3 --> [aggregate] --> [judge] x3 --> [report] --> (complete)
 *
 * Data flow:
 * 1. Start node: receives topic input
 * 2. Ideate nodes (3 instances): each LLM generates creative suggestions
 * 3. Aggregate node: collects all ideas into array
 * 4. Judge nodes (3 instances): each LLM scores all ideas (0-10)
 * 5. Report node: single LLM ranks ideas by average score, produces final report
 *
 * This proves:
 * 1. Multiple fan-out/fan-in cycles in single workflow
 * 2. LLM action kind working end-to-end
 * 3. Context accumulation across stages
 * 4. Structured output from LLMs (JSON schemas)
 */
describe('Coordinator - Idea Ranking Pipeline', () => {
  it('generates ideas, scores them, and produces ranked report', async () => {
    const inputData = { topic: 'Names for my golden retriever puppy' };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ topic: s.string() }, { required: ['topic'] });

    // Each ideation node outputs suggestions
    const ideationSchema = s.object(
      {
        ideas: s.array(s.string()),
      },
      { required: ['ideas'] },
    );

    // Each judge node outputs scores for all ideas
    const judgingSchema = s.object(
      {
        scores: s.array(
          s.object(
            {
              idea: s.string(),
              score: s.number(),
            },
            { required: ['idea', 'score'] },
          ),
        ),
      },
      { required: ['scores'] },
    );

    // Final report schema
    const reportSchema = s.object(
      {
        summary: s.string(),
        ranked_ideas: s.array(
          s.object(
            {
              rank: s.number(),
              idea: s.string(),
              average_score: s.number(),
              judge_scores: s.array(s.number()),
            },
            { required: ['rank', 'idea', 'average_score', 'judge_scores'] },
          ),
        ),
        recommendation: s.string(),
      },
      { required: ['summary', 'ranked_ideas', 'recommendation'] },
    );

    // Workflow output
    const workflowOutputSchema = s.object(
      {
        topic: s.string(),
        report: reportSchema,
      },
      { required: ['topic', 'report'] },
    );

    // Context schema to hold intermediate state
    const contextSchema = s.object({
      all_ideas: s.array(s.string()),
      all_judgments: s.array(judgingSchema),
    });

    // =========================================================================
    // Start Node - Pass-through
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
    // Ideate Node - LLM generates creative suggestions (spawned 3 times)
    // =========================================================================
    const ideatePrompt = promptSpec({
      name: 'Ideate Prompt',
      description: 'Generates creative ideas for a topic',
      template: `You are brainstormer #{{branch_index}}. Generate 1 unique and creative suggestion for: {{topic}}

IMPORTANT: Your idea must be DIFFERENT from all other brainstormers. As brainstormer #{{branch_index}}, be creative in your own unique way!

Return JSON with:
- "ideas": array with 1 string suggestion`,
      template_language: 'handlebars',
      requires: { topic: s.string(), branch_index: s.number() },
      produces: ideationSchema,
    });

    const ideateAction = action({
      name: 'Ideate Action',
      description: 'Generates creative ideas',
      kind: 'llm_call',
      implementation: { prompt_spec: ideatePrompt },
    });

    const ideateStep = step({
      ref: 'ideate_step',
      ordinal: 0,
      action: ideateAction,
      input_mapping: { topic: '$.input.topic', branch_index: '$.input.branch_index' },
      output_mapping: {
        'output.ideas': '$.response.ideas',
      },
    });

    const ideateTask = task({
      name: 'Ideate Task',
      description: 'Task that generates creative ideas',
      input_schema: s.object(
        { topic: s.string(), branch_index: s.number() },
        { required: ['topic', 'branch_index'] },
      ),
      output_schema: ideationSchema,
      steps: [ideateStep],
    });

    const ideateNode = node({
      ref: 'ideate_node',
      name: 'Generate Ideas',
      task: ideateTask,
      task_version: 1,
      input_mapping: { topic: '$.input.topic', branch_index: '$._token.branch_index' },
      output_mapping: {
        'output.ideas': '$.ideas',
      },
    });

    // =========================================================================
    // Aggregate Node - Collects all ideas (fan-in point)
    // =========================================================================
    const aggregateAction = action({
      name: 'Aggregate Action',
      description: 'No-op - merge handles aggregation',
      kind: 'update_context',
      implementation: {},
    });

    const aggregateStep = step({
      ref: 'aggregate_step',
      ordinal: 0,
      action: aggregateAction,
      input_mapping: {},
      output_mapping: {},
    });

    const aggregateTask = task({
      name: 'Aggregate Task',
      description: 'No-op',
      input_schema: s.object({}),
      output_schema: s.object({}),
      steps: [aggregateStep],
    });

    const aggregateNode = node({
      ref: 'aggregate_node',
      name: 'Aggregate Ideas',
      task: aggregateTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {},
    });

    // =========================================================================
    // Judge Node - LLM scores all ideas (spawned 3 times)
    // =========================================================================
    const judgePrompt = promptSpec({
      name: 'Judge Prompt',
      description: 'Scores ideas on quality',
      template: `You are a critical judge evaluating suggestions for: {{topic}}

Here are the ideas to evaluate:
{{#each ideas}}
- {{this}}
{{/each}}

Score each idea from 0-10 based on:
- Creativity and uniqueness
- Appropriateness for the topic
- Memorability and appeal

Return JSON with:
- "scores": array of objects, each with "idea" (string), "score" (number 0-10)`,
      template_language: 'handlebars',
      requires: s.object({
        topic: s.string(),
        ideas: s.array(s.string()),
      }),
      produces: judgingSchema,
    });

    const judgeAction = action({
      name: 'Judge Action',
      description: 'Scores ideas',
      kind: 'llm_call',
      implementation: { prompt_spec: judgePrompt },
    });

    const judgeStep = step({
      ref: 'judge_step',
      ordinal: 0,
      action: judgeAction,
      input_mapping: {
        topic: '$.input.topic',
        ideas: '$.input.ideas',
      },
      output_mapping: {
        'output.scores': '$.response.scores',
      },
    });

    const judgeTask = task({
      name: 'Judge Task',
      description: 'Task that scores ideas',
      input_schema: s.object(
        {
          topic: s.string(),
          ideas: s.array(s.string()),
        },
        { required: ['topic', 'ideas'] },
      ),
      output_schema: judgingSchema,
      steps: [judgeStep],
    });

    const judgeNode = node({
      ref: 'judge_node',
      name: 'Judge Ideas',
      task: judgeTask,
      task_version: 1,
      input_mapping: {
        topic: '$.input.topic',
        ideas: '$.state.all_ideas',
      },
      output_mapping: {
        'output.scores': '$.scores',
      },
    });

    // =========================================================================
    // Report Node - Single LLM produces final ranked report
    // =========================================================================
    const reportPrompt = promptSpec({
      name: 'Report Prompt',
      description: 'Produces final ranked report',
      template: `You are preparing a final report for: {{topic}}

Multiple judges have scored the following ideas:

{{#each judgments}}
Judge {{@index}}:
{{#each this.scores}}
  - "{{this.idea}}": {{this.score}}/10
{{/each}}

{{/each}}

Create a final report that:
1. Calculates the average score for each idea across all judges
2. Ranks ideas from highest to lowest average score
3. Provides a clear recommendation

Return JSON with:
- "summary": brief overview of the evaluation process
- "ranked_ideas": array of objects with "rank", "idea", "average_score", "judge_scores" (array of individual scores)
- "recommendation": your final recommendation`,
      template_language: 'handlebars',
      requires: s.object({
        topic: s.string(),
        judgments: s.array(judgingSchema),
      }),
      produces: reportSchema,
    });

    const reportAction = action({
      name: 'Report Action',
      description: 'Produces final report',
      kind: 'llm_call',
      implementation: { prompt_spec: reportPrompt },
    });

    const reportStep = step({
      ref: 'report_step',
      ordinal: 0,
      action: reportAction,
      input_mapping: {
        topic: '$.input.topic',
        judgments: '$.input.judgments',
      },
      output_mapping: {
        'output.report': '$.response',
      },
    });

    const reportTask = task({
      name: 'Report Task',
      description: 'Task that produces final report',
      input_schema: s.object(
        {
          topic: s.string(),
          judgments: s.array(judgingSchema),
        },
        { required: ['topic', 'judgments'] },
      ),
      output_schema: s.object({ report: reportSchema }, { required: ['report'] }),
      steps: [reportStep],
    });

    const reportNode = node({
      ref: 'report_node',
      name: 'Generate Report',
      task: reportTask,
      task_version: 1,
      input_mapping: {
        topic: '$.input.topic',
        judgments: '$.state.all_judgments',
      },
      output_mapping: {
        'output.report': '$.report',
      },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Start -> Ideate (fan-out to 3)
    const startToIdeate = transition({
      ref: 'start_to_ideate',
      from_node_ref: 'start_node',
      to_node_ref: 'ideate_node',
      priority: 1,
      spawn_count: 3,
    });

    // Ideate -> Aggregate (fan-in, collect ideas)
    const ideateToAggregate = transition({
      ref: 'ideate_to_aggregate',
      from_node_ref: 'ideate_node',
      to_node_ref: 'aggregate_node',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'start_to_ideate',
        merge: {
          source: '_branch.output.ideas',
          target: 'state.all_ideas',
          strategy: 'append', // Flattens all idea arrays into single array
        },
      },
    });

    // Aggregate -> Judge (fan-out to 3)
    const aggregateToJudge = transition({
      ref: 'aggregate_to_judge',
      from_node_ref: 'aggregate_node',
      to_node_ref: 'judge_node',
      priority: 1,
      spawn_count: 3,
    });

    // Judge -> Report (fan-in, collect judgments)
    const judgeToReport = transition({
      ref: 'judge_to_report',
      from_node_ref: 'judge_node',
      to_node_ref: 'report_node',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'aggregate_to_judge',
        merge: {
          source: '_branch.output',
          target: 'state.all_judgments',
          strategy: 'append',
        },
      },
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Idea Ranking Pipeline',
        description: 'Multi-stage fan-out/fan-in with LLM ideation, judging, and reporting',
        input_schema: inputSchema,
        context_schema: contextSchema,
        output_schema: workflowOutputSchema,
        output_mapping: {
          topic: '$.input.topic',
          report: '$.output.report',
        },
        initial_node_ref: 'start_node',
        nodes: [startNode, ideateNode, aggregateNode, judgeNode, reportNode],
        transitions: [startToIdeate, ideateToAggregate, aggregateToJudge, judgeToReport],
      }),
      inputData,
      {
        timeout: 120000, // 2 minutes total timeout
        idleTimeout: 30000, // 30 seconds idle timeout for LLM calls
      },
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Idea Ranking Pipeline Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Verify token count:
    // - 1 start_node
    // - 3 ideate_node (fan-out #1)
    // - 3 aggregate_node waiting + 1 continuation
    // - 3 judge_node (fan-out #2)
    // - 3 report_node waiting + 1 continuation
    const tokenCreations = trace.tokens.creations();
    console.log(`  Token creations: ${tokenCreations.length}`);
    // Expected: 1 + 3 + 4 + 3 + 4 = 15 tokens
    expect(tokenCreations.length).toBe(15);
    console.log('  ✓ Correct token count (15 tokens)');

    // 3. Verify two fan-out transitions occurred
    const routingMatches = trace.routing.matches();
    const fanOutRoutings = routingMatches.filter((m) => m.payload.spawn_count === 3);
    expect(fanOutRoutings.length).toBe(2);
    console.log('  ✓ Two fan-out transitions (3 tokens each)');

    // 4. Extract final output
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      topic: string;
      report: {
        summary: string;
        ranked_ideas: Array<{
          rank: number;
          idea: string;
          average_score: number;
          judge_scores: number[];
        }>;
        recommendation: string;
      };
    };

    // 5. Verify report structure
    expect(finalOutput.report).toBeDefined();
    expect(finalOutput.report.summary).toBeDefined();
    expect(finalOutput.report.ranked_ideas).toBeDefined();
    expect(finalOutput.report.ranked_ideas.length).toBeGreaterThan(0);
    expect(finalOutput.report.recommendation).toBeDefined();
    console.log('  ✓ Report has required structure');

    // 6. Verify ideas are ranked (sorted by average score descending)
    const ranks = finalOutput.report.ranked_ideas.map((r) => r.rank);
    const expectedRanks = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(expectedRanks);
    console.log('  ✓ Ideas are properly ranked');

    // 7. Verify each ranked idea has judge scores (at least 1, since we have 3 judges)
    const allHaveScores = finalOutput.report.ranked_ideas.every(
      (r) => r.judge_scores && r.judge_scores.length >= 1,
    );
    expect(allHaveScores).toBe(true);
    console.log('  ✓ Each idea has judge scores');

    // 8. Print the report
    console.log(`\n  📋 Final Report for: "${finalOutput.topic}"\n`);
    console.log(`  Summary: ${finalOutput.report.summary}\n`);
    console.log('  Ranked Ideas:');
    for (const item of finalOutput.report.ranked_ideas) {
      console.log(
        `    #${item.rank}: "${item.idea}" - Avg: ${item.average_score.toFixed(1)} [${item.judge_scores.join(', ')}]`,
      );
    }
    console.log(`\n  Recommendation: ${finalOutput.report.recommendation}`);

    // 9. Verify topic preserved
    expect(finalOutput.topic).toBe(inputData.topic);
    console.log(`\n  ✓ Topic preserved: "${finalOutput.topic}"`);

    // 10. All tokens completed
    for (const tc of tokenCreations) {
      const statuses = trace.tokens.statusTransitions(tc.token_id!);
      expect(statuses).toContain('completed');
    }
    console.log('  ✓ All tokens completed successfully');

    console.log('\n✅ Idea ranking pipeline complete\n');

    await cleanup();
  }, 180000); // 3 minute timeout for multiple LLM calls
});
