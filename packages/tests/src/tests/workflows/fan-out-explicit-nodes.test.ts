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
 * Fan-Out Explicit Nodes Test
 *
 * Tests the coordinator's ability to fan out to multiple explicit parallel nodes.
 *
 * Workflow structure:
 *   [start_node] → [worker_1]
 *                → [worker_2]  → [collect_node] → (complete)
 *                → [worker_3]
 *
 * Data flow:
 * - Start node: receives input, fans out to 3 worker nodes via separate transitions
 * - Worker nodes 1-3: each runs independently (in parallel)
 * - Collect node: waits for all 3, aggregates into final output
 *
 * This proves:
 * 1. Fan-out: single node triggers multiple downstream nodes via multiple transitions
 * 2. Parallel execution: all 3 worker nodes run concurrently
 * 3. Fan-in: collect node waits for all siblings to complete
 * 4. Data aggregation: final output contains results from all branches
 */
describe('Coordinator - Fan-Out Explicit Nodes', () => {
  it('fans out to 3 parallel trivia generators and collects results', async () => {
    const inputData = { topic: 'ancient history' };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ topic: s.string() }, { required: ['topic'] });

    // Each trivia node outputs question + answer
    const triviaSchema = s.object(
      { question: s.string(), answer: s.string() },
      { required: ['question', 'answer'] },
    );

    // Collect node output - all 3 Q&A pairs
    const collectSchema = s.object(
      {
        q1: s.string(),
        a1: s.string(),
        q2: s.string(),
        a2: s.string(),
        q3: s.string(),
        a3: s.string(),
      },
      { required: ['q1', 'a1', 'q2', 'a2', 'q3', 'a3'] },
    );

    // Workflow output
    const workflowOutputSchema = s.object(
      {
        question_1: s.string(),
        answer_1: s.string(),
        question_2: s.string(),
        answer_2: s.string(),
        question_3: s.string(),
        answer_3: s.string(),
      },
      { required: ['question_1', 'answer_1', 'question_2', 'answer_2', 'question_3', 'answer_3'] },
    );

    // =========================================================================
    // Start Node - Just passes topic through, triggers fan-out via transitions
    // =========================================================================
    const startPrompt = promptSpec({
      name: 'Start Prompt',
      description: 'Acknowledges topic',
      template: 'Acknowledge the topic: {{topic}}. Return JSON with "topic": "{{topic}}"',
      template_language: 'handlebars',
      requires: { topic: s.string() },
      produces: s.object({ topic: s.string() }, { required: ['topic'] }),
    });

    const startAction = action({
      name: 'Start Action',
      description: 'Starts workflow',
      kind: 'llm_call',
      implementation: { prompt_spec: startPrompt },
    });

    const startStep = step({
      ref: 'start_step',
      ordinal: 0,
      action: startAction,
      action_version: 1,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: { 'output.topic': '$.response.topic' },
    });

    const startTask = task({
      name: 'Start Task',
      description: 'Start task',
      input_schema: s.object({ topic: s.string() }, { required: ['topic'] }),
      output_schema: s.object({ topic: s.string() }, { required: ['topic'] }),
      steps: [startStep],
    });

    const startNode = node({
      ref: 'start_node',
      name: 'Start',
      task: startTask,
      task_version: 1,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: { 'state.topic': '$.topic' },
    });

    // =========================================================================
    // Trivia Node Factory - Creates 3 similar trivia generator nodes
    // =========================================================================
    const createTriviaNode = (num: number, focus: string) => {
      const prompt = promptSpec({
        name: `Trivia ${num} Prompt`,
        description: `Generates trivia question ${num}`,
        template: `Generate a trivia question about {{topic}}, focusing on ${focus}.

Return a JSON object with:
- "question": A specific trivia question
- "answer": The correct answer (1-3 words)`,
        template_language: 'handlebars',
        requires: { topic: s.string() },
        produces: triviaSchema,
      });

      const triviaAction = action({
        name: `Trivia ${num} Action`,
        description: `Generates trivia ${num}`,
        kind: 'llm_call',
        implementation: { prompt_spec: prompt },
      });

      const triviaStep = step({
        ref: `trivia_${num}_step`,
        ordinal: 0,
        action: triviaAction,
        action_version: 1,
        input_mapping: { topic: '$.input.topic' },
        output_mapping: {
          'output.question': '$.response.question',
          'output.answer': '$.response.answer',
        },
      });

      const triviaTask = task({
        name: `Trivia ${num} Task`,
        description: `Task that generates trivia ${num}`,
        input_schema: s.object({ topic: s.string() }, { required: ['topic'] }),
        output_schema: triviaSchema,
        steps: [triviaStep],
      });

      return node({
        ref: `trivia_${num}_node`,
        name: `Trivia ${num}`,
        task: triviaTask,
        task_version: 1,
        input_mapping: { topic: '$.state.topic' },
        output_mapping: {
          [`state.question_${num}`]: '$.question',
          [`state.answer_${num}`]: '$.answer',
        },
      });
    };

    const trivia1Node = createTriviaNode(1, 'people and leaders');
    const trivia2Node = createTriviaNode(2, 'places and geography');
    const trivia3Node = createTriviaNode(3, 'events and dates');

    // =========================================================================
    // Collect Node - Waits for all 3, aggregates results
    // =========================================================================
    const collectPrompt = promptSpec({
      name: 'Collect Prompt',
      description: 'Collects all trivia',
      template: `Collect these trivia results:

Q1: {{q1}}
A1: {{a1}}

Q2: {{q2}}
A2: {{a2}}

Q3: {{q3}}
A3: {{a3}}

Return a JSON object echoing all 6 values exactly:
{"q1": "{{q1}}", "a1": "{{a1}}", "q2": "{{q2}}", "a2": "{{a2}}", "q3": "{{q3}}", "a3": "{{a3}}"}`,
      template_language: 'handlebars',
      requires: {
        q1: s.string(),
        a1: s.string(),
        q2: s.string(),
        a2: s.string(),
        q3: s.string(),
        a3: s.string(),
      },
      produces: collectSchema,
    });

    const collectAction = action({
      name: 'Collect Action',
      description: 'Collects trivia',
      kind: 'llm_call',
      implementation: { prompt_spec: collectPrompt },
    });

    const collectStep = step({
      ref: 'collect_step',
      ordinal: 0,
      action: collectAction,
      action_version: 1,
      input_mapping: {
        q1: '$.input.q1',
        a1: '$.input.a1',
        q2: '$.input.q2',
        a2: '$.input.a2',
        q3: '$.input.q3',
        a3: '$.input.a3',
      },
      output_mapping: {
        'output.q1': '$.response.q1',
        'output.a1': '$.response.a1',
        'output.q2': '$.response.q2',
        'output.a2': '$.response.a2',
        'output.q3': '$.response.q3',
        'output.a3': '$.response.a3',
      },
    });

    const collectTask = task({
      name: 'Collect Task',
      description: 'Task that collects trivia',
      input_schema: s.object(
        {
          q1: s.string(),
          a1: s.string(),
          q2: s.string(),
          a2: s.string(),
          q3: s.string(),
          a3: s.string(),
        },
        { required: ['q1', 'a1', 'q2', 'a2', 'q3', 'a3'] },
      ),
      output_schema: collectSchema,
      steps: [collectStep],
    });

    const collectNode = node({
      ref: 'collect_node',
      name: 'Collect Results',
      task: collectTask,
      task_version: 1,
      // Reads all 3 Q&A pairs from state
      input_mapping: {
        q1: '$.state.question_1',
        a1: '$.state.answer_1',
        q2: '$.state.question_2',
        a2: '$.state.answer_2',
        q3: '$.state.question_3',
        a3: '$.state.answer_3',
      },
      output_mapping: {
        'output.question_1': '$.q1',
        'output.answer_1': '$.a1',
        'output.question_2': '$.q2',
        'output.answer_2': '$.a2',
        'output.question_3': '$.q3',
        'output.answer_3': '$.a3',
      },
    });

    // =========================================================================
    // Transitions - Fan-out from start, fan-in to collect
    // =========================================================================
    const startToTrivia1 = transition({
      ref: 'start_to_trivia_1',
      from_node_ref: 'start_node',
      to_node_ref: 'trivia_1_node',
      priority: 1,
    });

    const startToTrivia2 = transition({
      ref: 'start_to_trivia_2',
      from_node_ref: 'start_node',
      to_node_ref: 'trivia_2_node',
      priority: 1,
    });

    const startToTrivia3 = transition({
      ref: 'start_to_trivia_3',
      from_node_ref: 'start_node',
      to_node_ref: 'trivia_3_node',
      priority: 1,
    });

    const trivia1ToCollect = transition({
      ref: 'trivia_1_to_collect',
      from_node_ref: 'trivia_1_node',
      to_node_ref: 'collect_node',
      priority: 1,
    });

    const trivia2ToCollect = transition({
      ref: 'trivia_2_to_collect',
      from_node_ref: 'trivia_2_node',
      to_node_ref: 'collect_node',
      priority: 1,
    });

    const trivia3ToCollect = transition({
      ref: 'trivia_3_to_collect',
      from_node_ref: 'trivia_3_node',
      to_node_ref: 'collect_node',
      priority: 1,
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: `Fan-Out Trivia Workflow ${Date.now()}`,
        description: 'Tests fan-out to 3 parallel nodes and fan-in collection',
        input_schema: inputSchema,
        context_schema: s.object({
          topic: s.string(),
          question_1: s.string(),
          answer_1: s.string(),
          question_2: s.string(),
          answer_2: s.string(),
          question_3: s.string(),
          answer_3: s.string(),
        }),
        output_schema: workflowOutputSchema,
        output_mapping: {
          question_1: '$.output.question_1',
          answer_1: '$.output.answer_1',
          question_2: '$.output.question_2',
          answer_2: '$.output.answer_2',
          question_3: '$.output.question_3',
          answer_3: '$.output.answer_3',
        },
        initial_node_ref: 'start_node',
        nodes: [startNode, trivia1Node, trivia2Node, trivia3Node, collectNode],
        transitions: [
          startToTrivia1,
          startToTrivia2,
          startToTrivia3,
          trivia1ToCollect,
          trivia2ToCollect,
          trivia3ToCollect,
        ],
      }),
      inputData,
      { logEvents: false },
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Fan-Out Trivia Workflow Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Seven tokens created (start + 3 trivia + 3 to collect)
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations.length).toBe(7);
    console.log(`  ✓ ${tokenCreations.length} tokens created (start + 3 trivia + 3 to collect)`);

    // 3. Fan-out: 3 transitions from start node
    const routingMatches = trace.routing.matches();
    // Should have at least 3 matches from start node (fan-out)
    // plus 3 matches from trivia nodes to collect (fan-in triggers)
    expect(routingMatches.length).toBeGreaterThanOrEqual(3);
    console.log(`  ✓ ${routingMatches.length} transition matches (includes fan-out)`);

    // 4. Extract all Q&A from state using setFieldAt
    const getStateValue = (key: string): string => {
      const write = trace.context.setFieldAt(`state.${key}`);
      return write ? (write.payload.value as string) : '';
    };

    const q1 = getStateValue('question_1');
    const a1 = getStateValue('answer_1');
    const q2 = getStateValue('question_2');
    const a2 = getStateValue('answer_2');
    const q3 = getStateValue('question_3');
    const a3 = getStateValue('answer_3');

    console.log('\n  📋 Generated Trivia:');
    console.log(`     Q1: ${q1}`);
    console.log(`     A1: ${a1}`);
    console.log(`     Q2: ${q2}`);
    console.log(`     A2: ${a2}`);
    console.log(`     Q3: ${q3}`);
    console.log(`     A3: ${a3}`);

    // All 3 Q&A pairs should be non-empty
    expect(q1).toBeTruthy();
    expect(a1).toBeTruthy();
    expect(q2).toBeTruthy();
    expect(a2).toBeTruthy();
    expect(q3).toBeTruthy();
    expect(a3).toBeTruthy();
    console.log('\n  ✓ All 3 trivia Q&A pairs generated');

    // 5. Final output contains all 6 values
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      question_1: string;
      answer_1: string;
      question_2: string;
      answer_2: string;
      question_3: string;
      answer_3: string;
    };

    expect(finalOutput.question_1).toBeDefined();
    expect(finalOutput.answer_1).toBeDefined();
    expect(finalOutput.question_2).toBeDefined();
    expect(finalOutput.answer_2).toBeDefined();
    expect(finalOutput.question_3).toBeDefined();
    expect(finalOutput.answer_3).toBeDefined();

    console.log('\n  📋 Final Output:');
    console.log(`     Q1: ${finalOutput.question_1}`);
    console.log(`     A1: ${finalOutput.answer_1}`);
    console.log(`     Q2: ${finalOutput.question_2}`);
    console.log(`     A2: ${finalOutput.answer_2}`);
    console.log(`     Q3: ${finalOutput.question_3}`);
    console.log(`     A3: ${finalOutput.answer_3}`);

    // 6. Verify data integrity - final output matches state
    expect(finalOutput.question_1).toBe(q1);
    expect(finalOutput.answer_1).toBe(a1);
    expect(finalOutput.question_2).toBe(q2);
    expect(finalOutput.answer_2).toBe(a2);
    expect(finalOutput.question_3).toBe(q3);
    expect(finalOutput.answer_3).toBe(a3);
    console.log('\n  ✓ Final output matches state values');

    // 7. All tokens completed
    for (let i = 0; i < tokenCreations.length; i++) {
      const statuses = trace.tokens.statusTransitions(tokenCreations[i].token_id!);
      expect(statuses).toContain('completed');
      console.log(`  ✓ Token ${i + 1}: ${statuses.join(' → ')}`);
    }

    console.log('\n✅ Fan-out trivia workflow complete - parallel execution proven\n');

    await cleanup();
  });
});
