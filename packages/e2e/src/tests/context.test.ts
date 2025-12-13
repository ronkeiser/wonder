import { action, node, promptSpec, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

describe('Coordinator - Context Operations', () => {
  it('validates context initialization, input validation, and trace events', async () => {
    const inputData = { name: 'Alice', count: 42 };

    const { result, cleanup } = await runTestWorkflow(
      workflowDef({
        name: `Context Test Workflow ${Date.now()}`,
        description: 'Workflow to test context operations',
        input_schema: schema.object(
          { name: schema.string(), count: schema.number() },
          { required: ['name', 'count'] },
        ),
        context_schema: schema.object({
          processed: schema.boolean(),
          intermediate_result: schema.string(),
        }),
        output_schema: schema.object(
          { greeting: schema.string(), final_count: schema.number() },
          { required: ['greeting', 'final_count'] },
        ),
        output_mapping: {
          greeting: '$.output.greeting',
          final_count: '$.output.processed_count',
        },
        initial_node_ref: 'process_node',
        nodes: [
          node({
            ref: 'process_node',
            name: 'Process Input',
            task: taskDef({
              name: 'Test Task',
              description: 'Task that processes input',
              input_schema: schema.object(
                { name: schema.string(), count: schema.number() },
                { required: ['name', 'count'] },
              ),
              output_schema: schema.object(
                { greeting: schema.string(), processed_count: schema.number() },
                { required: ['greeting', 'processed_count'] },
              ),
              steps: [
                step({
                  ref: 'process',
                  ordinal: 0,
                  action: action({
                    name: 'Test Action',
                    description: 'Processes input',
                    kind: 'llm_call',
                    implementation: {
                      prompt_spec: promptSpec({
                        name: 'Test Prompt',
                        description: 'Processes input and returns greeting',
                        template: 'Process: {{name}} (count: {{count}})',
                        template_language: 'handlebars',
                        requires: { name: schema.string(), count: schema.number() },
                        produces: schema.object(
                          { greeting: schema.string(), processed_count: schema.number() },
                          { required: ['greeting', 'processed_count'] },
                        ),
                      }),
                    },
                  }),
                  action_version: 1,
                  input_mapping: { name: '$.input.name', count: '$.input.count' },
                  output_mapping: {
                    'output.greeting': '$.response.greeting',
                    'output.processed_count': '$.response.processed_count',
                  },
                }),
              ],
            }),
            task_version: 1,
            input_mapping: {
              name: '$.input.name',
              count: '$.input.count',
            },
            output_mapping: {
              'output.greeting': '$.greeting',
              'output.processed_count': '$.processed_count',
            },
          }),
        ],
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

    // Validate output write - with new architecture, outputs are written directly to output table
    // (not nested under node ref like the old approach)
    const allOutputWrites = trace.context.writesTo('output');
    console.log('📊 All output write events:', allOutputWrites.length);
    allOutputWrites.forEach((e, i) => {
      console.log(`  [${i}] seq=${e.sequence} value=${JSON.stringify(e.payload.value)}`);
    });

    // Get the LAST write to output (after applyOutputMapping)
    const outputWrite = allOutputWrites[allOutputWrites.length - 1];
    console.log('📊 Final output write event:', JSON.stringify(outputWrite?.payload, null, 2));

    expect(outputWrite).toBeDefined();
    expect(outputWrite!.payload.path).toBe('output');
    expect(outputWrite!.payload.value).toBeDefined();
    const outputValue = outputWrite!.payload.value as Record<string, unknown>;
    // With new architecture, output is written directly (not under node ref)
    expect(outputValue.greeting).toBeDefined();
    expect(outputValue.processed_count).toBeDefined();
    console.log('  ✓ operation.context.write (output stored directly)');

    // Validate output was read in snapshot
    const outputReads = trace.context.readsFrom('output');
    expect(outputReads.length).toBeGreaterThan(0);
    console.log('  ✓ Context read includes output data');

    console.log('\n✅ Context operations validation complete');

    await cleanup();
  });
});
