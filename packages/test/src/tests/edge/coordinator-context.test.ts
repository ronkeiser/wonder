import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';

describe('Coordinator - Context Operations', () => {
  it('validates context initialization, input validation, and trace events', async () => {
    // Step 1: Create workspace
    const workspaceResponse = await wonder.workspaces.create({
      name: `Test Workspace ${Date.now()}`,
    });

    expect(workspaceResponse).toBeDefined();
    expect(workspaceResponse?.workspace).toBeDefined();
    const workspaceId = workspaceResponse!.workspace.id;
    console.log('✓ Workspace created:', workspaceId);

    // Step 2: Create project
    const projectResponse = await wonder.projects.create({
      workspace_id: workspaceId,
      name: `Test Project ${Date.now()}`,
      description: 'Test project for context operations',
    });

    expect(projectResponse).toBeDefined();
    const projectId = projectResponse!.project.id;
    console.log('✓ Project created:', projectId);

    // Step 3: Create model profile
    const modelProfileResponse = await wonder['model-profiles'].create({
      name: `Test Model Profile ${Date.now()}`,
      provider: 'cloudflare',
      model_id: '@cf/meta/llama-3.1-8b-instruct',
      parameters: {
        max_tokens: 512,
        temperature: 1.0,
      },
      cost_per_1k_input_tokens: 0.0,
      cost_per_1k_output_tokens: 0.0,
    });

    expect(modelProfileResponse).toBeDefined();
    const modelProfileId = modelProfileResponse!.model_profile.id;
    console.log('✓ Model profile created:', modelProfileId);

    // Step 4: Create prompt spec that echoes input
    const echoPromptResponse = await wonder['prompt-specs'].create({
      version: 1,
      name: 'Echo Input',
      description: 'Echo the input name and count',
      template: 'Return a greeting that says "Hello {{name}}" and count is {{count}}.',
      template_language: 'handlebars',
      requires: {
        name: schema.string(),
        count: schema.number(),
      },
      produces: schema.object(
        {
          greeting: schema.string(),
          processed_count: schema.number(),
        },
        { required: ['greeting', 'processed_count'] },
      ),
    });

    expect(echoPromptResponse).toBeDefined();
    const echoPromptId = echoPromptResponse!.prompt_spec.id;
    console.log('✓ Echo prompt spec created:', echoPromptId);

    // Step 5: Create echo action
    const echoActionResponse = await wonder.actions.create({
      version: 1,
      name: 'Echo Action',
      description: 'LLM action that processes input',
      kind: 'llm_call',
      implementation: {
        prompt_spec_id: echoPromptId,
        model_profile_id: modelProfileId,
      },
    });

    expect(echoActionResponse).toBeDefined();
    const echoActionId = echoActionResponse!.action.id;
    console.log('✓ Echo action created:', echoActionId);

    // Step 6: Create task definition that wraps the echo action
    const echoTask = taskDef({
      name: 'Echo Task',
      description: 'Task that wraps the echo action',
      version: 1,
      project_id: projectId,
      input_schema: schema.object(
        {
          name: schema.string(),
          count: schema.number(),
        },
        { required: ['name', 'count'] },
      ),
      output_schema: schema.object(
        {
          greeting: schema.string(),
          processed_count: schema.number(),
        },
        { required: ['greeting', 'processed_count'] },
      ),
      steps: [
        step({
          ref: 'call_echo',
          ordinal: 0,
          action_id: echoActionId,
          action_version: 1,
          input_mapping: {
            name: '$.input.name',
            count: '$.input.count',
          },
          output_mapping: {
            'output.greeting': '$.response.greeting',
            'output.processed_count': '$.response.processed_count',
          },
        }),
      ],
    });

    const taskDefResponse = await wonder['task-defs'].create(echoTask);

    expect(taskDefResponse).toBeDefined();
    expect(taskDefResponse?.task_def).toBeDefined();
    expect(taskDefResponse?.task_def.id).toBeDefined();

    const echoTaskId = taskDefResponse!.task_def.id;
    console.log('✓ Echo task def created:', echoTaskId);

    // Step 7: Create workflow with input, state, and output schemas
    const workflow = workflowDef({
      name: `Context Test Workflow ${Date.now()}`,
      description: 'Workflow to test context operations',
      project_id: projectId,
      input_schema: schema.object(
        {
          name: schema.string(),
          count: schema.number(),
        },
        { required: ['name', 'count'] },
      ),
      context_schema: schema.object({
        processed: schema.boolean(),
        intermediate_result: schema.string(),
      }),
      output_schema: schema.object(
        {
          greeting: schema.string(),
          final_count: schema.number(),
        },
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
          task_id: echoTaskId,
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
    });

    const workflowDefResponse = await wonder['workflow-defs'].create(workflow);

    if (!workflowDefResponse) {
      throw new Error('Failed to create workflow def');
    }

    expect(workflowDefResponse).toBeDefined();
    const workflowDefId = workflowDefResponse.workflow_def_id;
    console.log('✓ Workflow def created:', workflowDefId);

    // Step 8: Create workflow binding
    const workflowResponse = await wonder.workflows.create({
      project_id: projectId,
      workflow_def_id: workflowDefId,
      name: `Context Test Workflow ${Date.now()}`,
      description: 'Workflow execution for context testing',
    });

    expect(workflowResponse).toBeDefined();
    const workflowId = workflowResponse!.workflow.id;
    console.log('✓ Workflow created:', workflowId);

    // Step 9: Execute workflow with input data
    const inputData = {
      name: 'Alice',
      count: 42,
    };

    const result = await wonder.workflows(workflowId).stream(inputData, {
      timeout: 60000,
      idleTimeout: 10000,
    });

    expect(result).toBeDefined();
    const workflowRunId = result.workflow_run_id;
    console.log('✓ Workflow run ID:', workflowRunId);

    // Debug execution if workflow didn't complete
    if (result.status !== 'completed') {
      console.log('\n⚠️  Workflow did not complete.');
      console.log('Workflow events:', JSON.stringify(result.events, null, 2));
      console.log('Trace events:', JSON.stringify(result.traceEvents, null, 2));
    }

    expect(result.status).toBe('completed');

    // Step 10: Validate context trace events
    const trace = result.trace;

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
    const inputReads = contextReads.filter((e) => e.payload.path === 'input');
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
    const allOutputWrites = trace.context.writes().filter((e) => e.payload.path === 'output');
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
    const outputReads = contextReads.filter((e) => e.payload.path === 'output');
    expect(outputReads.length).toBeGreaterThan(0);
    console.log('  ✓ Context read includes output data');

    console.log('\n✅ Context operations validation complete');

    // Step 11: Clean up resources
    console.log('\n🧹 Cleaning up resources...');

    await wonder['workflow-runs'](workflowRunId).delete();
    console.log('  ✓ Deleted workflow run:', workflowRunId);

    await wonder.workflows(workflowId).delete();
    console.log('  ✓ Deleted workflow:', workflowId);

    await wonder['workflow-defs'](workflowDefId).delete();
    console.log('  ✓ Deleted workflow def:', workflowDefId);

    await wonder['task-defs'](echoTaskId).delete();
    console.log('  ✓ Deleted task def:', echoTaskId);

    await wonder.actions(echoActionId).delete();
    console.log('  ✓ Deleted action:', echoActionId);

    await wonder['prompt-specs'](echoPromptId).delete();
    console.log('  ✓ Deleted prompt spec:', echoPromptId);

    await wonder['model-profiles'](modelProfileId).delete();
    console.log('  ✓ Deleted model profile:', modelProfileId);

    await wonder.projects(projectId).delete();
    console.log('  ✓ Deleted project:', projectId);

    await wonder.workspaces(workspaceId).delete();
    console.log('  ✓ Deleted workspace:', workspaceId);

    console.log('✅ Cleanup complete');
  });
});
