import { action, node, promptSpec, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

describe('Coordinator - Context Operations', () => {
  it('validates context initialization, input validation, and trace events', async () => {
    const inputData = { name: 'Alice', count: 42 };

    // Define schemas once, reuse throughout
    const inputSchema = s.object(
      { name: s.string(), count: s.number() },
      { required: ['name', 'count'] },
    );
    const outputSchema = s.object(
      { greeting: s.string(), processed_count: s.number() },
      { required: ['greeting', 'processed_count'] },
    );

    // Define the prompt spec
    const testPrompt = promptSpec({
      name: 'Test Prompt',
      description: 'Processes input and returns greeting',
      template: 'Process: {{name}} (count: {{count}})',
      template_language: 'handlebars',
      requires: { name: s.string(), count: s.number() },
      produces: outputSchema,
    });

    // Define the action using the prompt spec
    const testAction = action({
      name: 'Test Action',
      description: 'Processes input',
      kind: 'llm_call',
      implementation: { prompt_spec: testPrompt },
    });

    // Define the step using the action
    const processStep = step({
      ref: 'process',
      ordinal: 0,
      action: testAction,
      action_version: 1,
      input_mapping: { name: '$.input.name', count: '$.input.count' },
      output_mapping: {
        'output.greeting': '$.response.greeting',
        'output.processed_count': '$.response.processed_count',
      },
    });

    // Define the task using the step
    const testTask = task({
      name: 'Test Task',
      description: 'Task that processes input',
      input_schema: inputSchema,
      output_schema: outputSchema,
      steps: [processStep],
    });

    // Define the node using the task
    const processNode = node({
      ref: 'process_node',
      name: 'Process Input',
      task: testTask,
      task_version: 1,
      input_mapping: { name: '$.input.name', count: '$.input.count' },
      output_mapping: {
        'output.greeting': '$.greeting',
        'output.processed_count': '$.processed_count',
      },
    });

    // Compose into workflow
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: `Context Test Workflow ${Date.now()}`,
        description: 'Workflow to test context operations',
        input_schema: inputSchema,
        context_schema: s.object({
          processed: s.boolean(),
          intermediate_result: s.string(),
        }),
        output_schema: s.object(
          { greeting: s.string(), final_count: s.number() },
          { required: ['greeting', 'final_count'] },
        ),
        output_mapping: {
          greeting: '$.output.greeting',
          final_count: '$.output.processed_count',
        },
        initial_node_ref: 'process_node',
        nodes: [processNode],
        transitions: [],
      }),
      inputData,
      { logEvents: false },
    );

    // Validate execution completed
    expect(result.status).toBe('completed');

    // Validate context trace events
    const { trace } = result;

    // Validate context initialization
    const contextInit = trace.context.initialize();
    expect(contextInit).toBeDefined();
    expect(contextInit!.payload.table_count).toBeGreaterThanOrEqual(3); // input, state, output
    console.log(
      `  ✓ operation.context.initialize (${contextInit!.payload.table_count} tables created)`,
    );

    // Validate input validation
    const contextValidate = trace.context.validate();
    expect(contextValidate).toBeDefined();
    expect(contextValidate!.payload.path).toBe('input');
    expect(contextValidate!.payload.valid).toBe(true);
    expect(contextValidate!.payload.error_count).toBe(0);
    console.log('  ✓ operation.context.validate (input validated successfully)');

    // Validate input write
    const inputWrite = trace.context.writeAt('input');
    expect(inputWrite).toBeDefined();
    expect(inputWrite!.payload.path).toBe('input');
    expect(inputWrite!.payload.value).toMatchObject(inputData);
    console.log('  ✓ operation.context.write (input stored)');

    // Validate context snapshot was taken (for decision logic)
    const snapshots = trace.context.snapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    console.log(`  ✓ operation.context.snapshot (${snapshots.length} snapshots taken)`);

    // Validate snapshot contains input data
    const firstSnapshot = snapshots[0];
    expect(firstSnapshot.payload.snapshot).toBeDefined();
    expect(firstSnapshot.payload.snapshot.input).toMatchObject(inputData);
    console.log('  ✓ Snapshot contains input data');

    // Validate context reads (input, state, output for snapshot)
    const contextReads = trace.context.reads();
    expect(contextReads.length).toBeGreaterThan(0);
    console.log(`  ✓ operation.context.read (${contextReads.length} reads)`);

    // Check that input was read
    const inputReads = trace.context.readsFrom('input');
    expect(inputReads.length).toBeGreaterThan(0);
    expect(inputReads[0].payload.value).toMatchObject(inputData);
    console.log('  ✓ Context read includes input data');

    // Validate input validation happened
    const inputValidation = trace.context.validateAt('input');
    expect(inputValidation).toBeDefined();
    expect(inputValidation!.payload.path).toBe('input');
    expect(inputValidation!.payload.valid).toBe(true);
    expect(inputValidation!.payload.error_count).toBe(0);
    console.log('  ✓ operation.context.validate (input validated successfully)');

    // Debug: print all trace events to see what's happening with output mapping
    const outputMappingInput = trace.find('operation.context.output_mapping.input');
    console.log('\n📊 Output mapping input:', JSON.stringify(outputMappingInput?.payload, null, 2));

    const outputMappingApply = trace.filter('operation.context.output_mapping.apply');
    console.log('📊 Output mapping apply events:', outputMappingApply.length);
    outputMappingApply.forEach((e, i) => {
      console.log(`  [${i}] ${JSON.stringify(e.payload)}`);
    });

    const outputMappingSkip = trace.find('operation.context.output_mapping.skip');
    if (outputMappingSkip) {
      console.log('📊 Output mapping skipped:', JSON.stringify(outputMappingSkip.payload, null, 2));
    }

    // Validate output writes - with new setField architecture, individual fields are written
    const outputSetFields = trace.context.setFieldsTo('output');
    console.log('📊 All output setField events:', outputSetFields.length);
    outputSetFields.forEach((e, i) => {
      console.log(`  [${i}] seq=${e.sequence} path=${e.payload.path} value=${JSON.stringify(e.payload.value)}`);
    });

    // Check for both output field writes
    const greetingWrite = trace.context.setFieldAt('output.greeting');
    const processedCountWrite = trace.context.setFieldAt('output.processed_count');
    
    expect(greetingWrite).toBeDefined();
    expect(greetingWrite!.payload.value).toBe('Hello Alice');
    expect(processedCountWrite).toBeDefined();
    expect(processedCountWrite!.payload.value).toBe(42);
    console.log('  ✓ operation.context.set_field (output fields stored)');

    // Validate output was read in snapshot
    const outputReads = trace.context.readsFrom('output');
    expect(outputReads.length).toBeGreaterThan(0);
    console.log('  ✓ Context read includes output data');

    console.log('\n✅ Context operations validation complete');

    await cleanup();
  });
});
