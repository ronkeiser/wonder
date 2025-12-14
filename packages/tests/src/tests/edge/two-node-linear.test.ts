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
 * Two-Node Linear Workflow Test
 *
 * Tests the coordinator's ability to:
 * 1. Execute an initial node
 * 2. Evaluate a transition after node completion
 * 3. Route to and execute a second node
 * 4. Apply output mappings at each stage
 * 5. Complete the workflow with final output
 *
 * Workflow structure:
 *   [process_node] → [transform_node] → (complete)
 *
 * Validates trace events for:
 * - Token creation (2 tokens total)
 * - Transition evaluation
 * - Output mapping at each node
 * - Workflow completion
 */
describe('Coordinator - Two Node Linear Workflow', () => {
  it('executes two nodes in sequence with transition routing', async () => {
    const inputData = { name: 'Alice', count: 42 };

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object(
      { name: s.string(), count: s.number() },
      { required: ['name', 'count'] },
    );

    // First node output: greeting
    const greetingSchema = s.object({ greeting: s.string() }, { required: ['greeting'] });

    // Second node output: transformed greeting with count
    const transformedSchema = s.object(
      { message: s.string(), doubled_count: s.number() },
      { required: ['message', 'doubled_count'] },
    );

    // Workflow output: combines both
    const workflowOutputSchema = s.object(
      { final_message: s.string(), final_count: s.number() },
      { required: ['final_message', 'final_count'] },
    );

    // =========================================================================
    // Node 1: Process - Creates greeting from input
    // =========================================================================
    const processPrompt = promptSpec({
      name: 'Process Prompt',
      description: 'Creates a greeting from name',
      template: 'Create a greeting for: {{name}}',
      template_language: 'handlebars',
      requires: { name: s.string() },
      produces: greetingSchema,
    });

    const processAction = action({
      name: 'Process Action',
      description: 'Creates greeting',
      kind: 'llm_call',
      implementation: { prompt_spec: processPrompt },
    });

    const processStep = step({
      ref: 'process_step',
      ordinal: 0,
      action: processAction,
      action_version: 1,
      input_mapping: { name: '$.input.name' },
      output_mapping: { 'output.greeting': '$.response.greeting' },
    });

    const processTask = task({
      name: 'Process Task',
      description: 'Task that creates greeting',
      input_schema: s.object({ name: s.string() }, { required: ['name'] }),
      output_schema: greetingSchema,
      steps: [processStep],
    });

    const processNode = node({
      ref: 'process_node',
      name: 'Process Input',
      task: processTask,
      task_version: 1,
      input_mapping: { name: '$.input.name' },
      output_mapping: { 'state.greeting': '$.greeting' },
    });

    // =========================================================================
    // Node 2: Transform - Takes greeting and count, creates final message
    // =========================================================================
    const transformPrompt = promptSpec({
      name: 'Transform Prompt',
      description: 'Transforms greeting with count',
      template: 'Transform greeting: {{greeting}} with count: {{count}}',
      template_language: 'handlebars',
      requires: { greeting: s.string(), count: s.number() },
      produces: transformedSchema,
    });

    const transformAction = action({
      name: 'Transform Action',
      description: 'Transforms greeting',
      kind: 'llm_call',
      implementation: { prompt_spec: transformPrompt },
    });

    const transformStep = step({
      ref: 'transform_step',
      ordinal: 0,
      action: transformAction,
      action_version: 1,
      input_mapping: { greeting: '$.input.greeting', count: '$.input.count' },
      output_mapping: {
        'output.message': '$.response.message',
        'output.doubled_count': '$.response.doubled_count',
      },
    });

    const transformTask = task({
      name: 'Transform Task',
      description: 'Task that transforms greeting',
      input_schema: s.object(
        { greeting: s.string(), count: s.number() },
        { required: ['greeting', 'count'] },
      ),
      output_schema: transformedSchema,
      steps: [transformStep],
    });

    const transformNode = node({
      ref: 'transform_node',
      name: 'Transform Output',
      task: transformTask,
      task_version: 1,
      // Input from state (previous node) and input (original workflow input)
      input_mapping: {
        greeting: '$.state.greeting',
        count: '$.input.count',
      },
      // Output mapping targets must match output_schema column names
      output_mapping: {
        'output.final_message': '$.message',
        'output.final_count': '$.doubled_count',
      },
    });

    // =========================================================================
    // Transition: process_node → transform_node
    // =========================================================================
    const processToTransform = transition({
      ref: 'process_to_transform',
      from_node_ref: 'process_node',
      to_node_ref: 'transform_node',
      priority: 1,
      // No condition = always follow
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: `Two Node Linear Workflow ${Date.now()}`,
        description: 'Tests two-node linear execution with transition routing',
        input_schema: inputSchema,
        context_schema: s.object({
          greeting: s.string(),
        }),
        output_schema: workflowOutputSchema,
        // Node writes to output.final_message and output.final_count directly
        // so we read from those same paths
        output_mapping: {
          final_message: '$.output.final_message',
          final_count: '$.output.final_count',
        },
        initial_node_ref: 'process_node',
        nodes: [processNode, transformNode],
        transitions: [processToTransform],
      }),
      inputData,
      { logEvents: false },
    );

    // =========================================================================
    // Assertions
    // =========================================================================
    console.log('\n🔍 Two-Node Linear Workflow Validation\n');

    // 1. Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed successfully');

    const { trace } = result;

    // 2. Context initialization
    const contextInit = trace.context.initialize();
    expect(contextInit).toBeDefined();
    console.log(`  ✓ Context initialized (${contextInit!.payload.table_count} tables)`);

    // 3. Input validation
    const inputValidation = trace.context.validateAt('input');
    expect(inputValidation).toBeDefined();
    expect(inputValidation!.payload.valid).toBe(true);
    console.log('  ✓ Input validated');

    // 4. Two tokens created (one per node)
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations.length).toBe(2);
    console.log(`  ✓ ${tokenCreations.length} tokens created`);

    // First token for process_node
    const firstToken = tokenCreations[0];
    expect(firstToken.payload.node_id).toBeDefined();
    console.log(`    - Token 1: node=${firstToken.payload.node_id}`);

    // Second token for transform_node
    const secondToken = tokenCreations[1];
    expect(secondToken.payload.node_id).toBeDefined();
    console.log(`    - Token 2: node=${secondToken.payload.node_id}`);

    // 5. Transition was evaluated
    const routingStart = trace.routing.starts();
    expect(routingStart.length).toBeGreaterThanOrEqual(1);
    console.log(`  ✓ ${routingStart.length} routing decisions made`);

    // 6. Transition matched (process → transform)
    const transitionMatches = trace.routing.matches();
    expect(transitionMatches.length).toBeGreaterThanOrEqual(1);
    console.log(`  ✓ ${transitionMatches.length} transition(s) matched`);

    // 7. Output mapping applied for first node (writes to state.greeting)
    const stateWrites = trace.context.writesTo('state');
    // Should have at least one write to state (greeting from process_node)
    const greetingWrite = stateWrites.find((w) => {
      const value = w.payload.value as Record<string, unknown>;
      return value && 'greeting' in value;
    });
    expect(greetingWrite).toBeDefined();
    console.log('  ✓ First node wrote to state.greeting');

    // 8. Output mapping applied for second node (writes to output)
    const outputWrites = trace.context.writesTo('output');
    expect(outputWrites.length).toBeGreaterThan(0);
    const finalOutput = outputWrites[outputWrites.length - 1];
    expect(finalOutput.payload.value).toBeDefined();
    console.log('  ✓ Second node wrote to output');

    // 9. Workflow completion extracted final output
    const completionStart = trace.completion.start();
    expect(completionStart).toBeDefined();
    console.log('  ✓ Completion started');

    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    expect(completionComplete!.payload.final_output).toBeDefined();
    console.log(
      '  ✓ Final output extracted:',
      JSON.stringify(completionComplete!.payload.final_output),
    );

    // 10. Verify token status transitions
    const firstTokenId = firstToken.payload.token_id;
    const secondTokenId = secondToken.payload.token_id;

    // Each token should go through: pending → dispatched → executing → completed
    const firstTokenStatuses = trace.tokens.statusTransitions(firstTokenId);
    const secondTokenStatuses = trace.tokens.statusTransitions(secondTokenId);

    console.log(`  ✓ Token 1 status transitions: ${firstTokenStatuses.join(' → ')}`);
    console.log(`  ✓ Token 2 status transitions: ${secondTokenStatuses.join(' → ')}`);

    // Both tokens should reach 'completed'
    expect(firstTokenStatuses).toContain('completed');
    expect(secondTokenStatuses).toContain('completed');

    console.log('\n✅ Two-node linear workflow validation complete\n');

    await cleanup();
  });
});
