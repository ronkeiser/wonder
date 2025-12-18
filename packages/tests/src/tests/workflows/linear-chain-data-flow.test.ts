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
 * Linear Chain Data Flow Test
 *
 * Tests a 3-node linear workflow where each node depends on specific
 * data from previous nodes, proving proper data isolation and flow.
 *
 * Workflow structure:
 *   [question_node] → [guess_node] → [judge_node] → (complete)
 *
 * Data flow:
 * - Node 1 (Question): Input topic → produces question + answer
 * - Node 2 (Guess): Gets ONLY the question (not the answer!) → produces guess
 * - Node 3 (Judge): Gets question, answer, AND guess → produces judgment
 *
 * This proves:
 * 1. Data flows through state between nodes
 * 2. Nodes can selectively read from state (node 2 doesn't see answer)
 * 3. Later nodes can aggregate data from multiple previous nodes
 */
describe('Coordinator - Linear Chain Data Flow', () => {
  it('executes 3-node chain with selective data access between nodes', async () => {
    const inputData = { topic: 'pets' };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ topic: s.string() }, { required: ['topic'] });

    // Node 1: Question generator output
    const questionSchema = s.object(
      { question: s.string(), answer: s.string() },
      { required: ['question', 'answer'] },
    );

    // Node 2: Guesser output
    const guessSchema = s.object({ guess: s.string() }, { required: ['guess'] });

    // Node 3: Judge output - includes all data for final output
    const judgmentSchema = s.object(
      {
        question: s.string(),
        correct_answer: s.string(),
        guess: s.string(),
        judgment: s.string(),
      },
      { required: ['question', 'correct_answer', 'guess', 'judgment'] },
    );

    // Workflow output: combines all
    const workflowOutputSchema = s.object(
      {
        question: s.string(),
        correct_answer: s.string(),
        guess: s.string(),
        judgment: s.string(),
      },
      { required: ['question', 'correct_answer', 'guess', 'judgment'] },
    );

    // =========================================================================
    // Node 1: Question Generator - Creates trivia question and answer
    // =========================================================================
    const questionPrompt = promptSpec({
      name: 'Question Generator Prompt',
      description: 'Generates a trivia question with answer',
      template: `Generate a simple trivia question about: {{topic}}

Return a JSON object with:
- "question": A clear, answerable trivia question
- "answer": The correct answer (keep it short, 1-3 words)

Make the question specific and factual.`,
      template_language: 'handlebars',
      requires: { topic: s.string() },
      produces: questionSchema,
    });

    const questionAction = action({
      name: 'Question Generator Action',
      description: 'Generates trivia question',
      kind: 'llm_call',
      implementation: { prompt_spec: questionPrompt },
    });

    const questionStep = step({
      ref: 'question_step',
      ordinal: 0,
      action: questionAction,
      action_version: 1,
      input_mapping: { topic: '$.input.topic' },
      output_mapping: {
        'output.question': '$.response.question',
        'output.answer': '$.response.answer',
      },
    });

    const questionTask = task({
      name: 'Question Generator Task',
      description: 'Task that generates trivia question',
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
      // Store BOTH question and answer in state
      output_mapping: {
        'state.question': '$.question',
        'state.correct_answer': '$.answer',
      },
    });

    // =========================================================================
    // Node 2: Guesser - Gets ONLY the question, must guess answer
    // =========================================================================
    const guessPrompt = promptSpec({
      name: 'Guesser Prompt',
      description: 'Guesses the answer to a trivia question',
      template: `Answer this trivia question: {{question}}

Return a JSON object with:
- "guess": Your best guess at the answer (keep it short, 1-3 words)`,
      template_language: 'handlebars',
      requires: { question: s.string() },
      produces: guessSchema,
    });

    const guessAction = action({
      name: 'Guesser Action',
      description: 'Guesses trivia answer',
      kind: 'llm_call',
      implementation: { prompt_spec: guessPrompt },
    });

    const guessStep = step({
      ref: 'guess_step',
      ordinal: 0,
      action: guessAction,
      action_version: 1,
      input_mapping: { question: '$.input.question' },
      output_mapping: { 'output.guess': '$.response.guess' },
    });

    const guessTask = task({
      name: 'Guesser Task',
      description: 'Task that guesses trivia answer',
      input_schema: s.object({ question: s.string() }, { required: ['question'] }),
      output_schema: guessSchema,
      steps: [guessStep],
    });

    const guessNode = node({
      ref: 'guess_node',
      name: 'Guess Answer',
      task: guessTask,
      task_version: 1,
      // CRITICAL: Only gets question, NOT the answer
      input_mapping: { question: '$.state.question' },
      output_mapping: { 'state.guess': '$.guess' },
    });

    // =========================================================================
    // Node 3: Judge - Gets all data, determines if guess was correct
    // =========================================================================
    const judgePrompt = promptSpec({
      name: 'Judge Prompt',
      description: 'Judges if the guess matches the correct answer',
      template: `You are a trivia judge. Determine if the guess is correct.

Question: {{question}}
Correct Answer: {{correct_answer}}
Guess: {{guess}}

Return a JSON object with these EXACT fields:
- "question": "{{question}}"
- "correct_answer": "{{correct_answer}}"
- "guess": "{{guess}}"
- "judgment": Either "correct" or "incorrect" (just one word)

Be lenient with minor spelling differences or equivalent answers.`,
      template_language: 'handlebars',
      requires: { question: s.string(), correct_answer: s.string(), guess: s.string() },
      produces: judgmentSchema,
    });

    const judgeAction = action({
      name: 'Judge Action',
      description: 'Judges trivia guess',
      kind: 'llm_call',
      implementation: { prompt_spec: judgePrompt },
    });

    const judgeStep = step({
      ref: 'judge_step',
      ordinal: 0,
      action: judgeAction,
      action_version: 1,
      input_mapping: {
        question: '$.input.question',
        correct_answer: '$.input.correct_answer',
        guess: '$.input.guess',
      },
      output_mapping: {
        'output.question': '$.response.question',
        'output.correct_answer': '$.response.correct_answer',
        'output.guess': '$.response.guess',
        'output.judgment': '$.response.judgment',
      },
    });

    const judgeTask = task({
      name: 'Judge Task',
      description: 'Task that judges trivia guess',
      input_schema: s.object(
        { question: s.string(), correct_answer: s.string(), guess: s.string() },
        { required: ['question', 'correct_answer', 'guess'] },
      ),
      output_schema: judgmentSchema,
      steps: [judgeStep],
    });

    const judgeNode = node({
      ref: 'judge_node',
      name: 'Judge Guess',
      task: judgeTask,
      task_version: 1,
      // Gets ALL data from state: question, correct_answer, and guess
      input_mapping: {
        question: '$.state.question',
        correct_answer: '$.state.correct_answer',
        guess: '$.state.guess',
      },
      // Write all final values to output (read from task output which LLM echoed back)
      output_mapping: {
        'output.question': '$.question',
        'output.correct_answer': '$.correct_answer',
        'output.guess': '$.guess',
        'output.judgment': '$.judgment',
      },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const questionToGuess = transition({
      ref: 'question_to_guess',
      from_node_ref: 'question_node',
      to_node_ref: 'guess_node',
      priority: 1,
    });

    const guessToJudge = transition({
      ref: 'guess_to_judge',
      from_node_ref: 'guess_node',
      to_node_ref: 'judge_node',
      priority: 1,
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Trivia Chain Workflow',
        description: 'Tests 3-node chain with data isolation and aggregation',
        input_schema: inputSchema,
        context_schema: s.object({
          question: s.string(),
          correct_answer: s.string(),
          guess: s.string(),
        }),
        output_schema: workflowOutputSchema,
        output_mapping: {
          question: '$.output.question',
          correct_answer: '$.output.correct_answer',
          guess: '$.output.guess',
          judgment: '$.output.judgment',
        },
        initial_node_ref: 'question_node',
        nodes: [questionNode, guessNode, judgeNode],
        transitions: [questionToGuess, guessToJudge],
      }),
      inputData,
      { logEvents: false },
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Trivia Chain Workflow Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Three tokens created (one per node)
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations.length).toBe(3);
    console.log(`  ✓ ${tokenCreations.length} tokens created (one per node)`);

    // 3. Two transitions matched
    const transitionMatches = trace.routing.matches();
    expect(transitionMatches.length).toBe(2);
    console.log(`  ✓ ${transitionMatches.length} transitions matched`);

    // 4. Extract data written to state at each step
    // With setField, individual fields are written to granular paths
    const questionWrite = trace.context.setFieldAt('state.question');
    expect(questionWrite).toBeDefined();
    const question = questionWrite!.payload.value as string;
    console.log(`  ✓ Node 1 generated question: "${question}"`);

    const answerWrite = trace.context.setFieldAt('state.correct_answer');
    expect(answerWrite).toBeDefined();
    const correctAnswer = answerWrite!.payload.value as string;
    console.log(`  ✓ Node 1 generated answer: "${correctAnswer}"`);

    const guessWrite = trace.context.setFieldAt('state.guess');
    expect(guessWrite).toBeDefined();
    const guess = guessWrite!.payload.value as string;
    console.log(`  ✓ Node 2 guessed: "${guess}"`);

    // 5. Final output contains all data
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      question: string;
      correct_answer: string;
      guess: string;
      judgment: string;
    };
    expect(finalOutput).toBeDefined();
    expect(finalOutput.question).toBeDefined();
    expect(finalOutput.correct_answer).toBeDefined();
    expect(finalOutput.guess).toBeDefined();
    expect(finalOutput.judgment).toBeDefined();

    console.log('\n  📋 Final Output:');
    console.log(`     Question: ${finalOutput.question}`);
    console.log(`     Correct Answer: ${finalOutput.correct_answer}`);
    console.log(`     Guess: ${finalOutput.guess}`);
    console.log(`     Judgment: ${finalOutput.judgment}`);

    // 6. Judgment should be either "correct" or "incorrect"
    expect(['correct', 'incorrect']).toContain(finalOutput.judgment.toLowerCase());
    console.log(`  ✓ Judgment is valid: "${finalOutput.judgment}"`);

    // 7. Verify data flow integrity - final output should match what was in state
    expect(finalOutput.question).toBe(question);
    expect(finalOutput.correct_answer).toBe(correctAnswer);
    expect(finalOutput.guess).toBe(guess);
    console.log('  ✓ Data flow integrity verified - all values match state writes');

    // 8. All tokens completed
    const firstTokenStatuses = trace.tokens.statusTransitions(tokenCreations[0].token_id!);
    const secondTokenStatuses = trace.tokens.statusTransitions(tokenCreations[1].token_id!);
    const thirdTokenStatuses = trace.tokens.statusTransitions(tokenCreations[2].token_id!);

    expect(firstTokenStatuses).toContain('completed');
    expect(secondTokenStatuses).toContain('completed');
    expect(thirdTokenStatuses).toContain('completed');

    console.log(`  ✓ Token 1 (question): ${firstTokenStatuses.join(' → ')}`);
    console.log(`  ✓ Token 2 (guess): ${secondTokenStatuses.join(' → ')}`);
    console.log(`  ✓ Token 3 (judge): ${thirdTokenStatuses.join(' → ')}`);

    console.log('\n✅ Trivia chain workflow complete - 3-node data flow proven\n');

    await cleanup();
  });
});
