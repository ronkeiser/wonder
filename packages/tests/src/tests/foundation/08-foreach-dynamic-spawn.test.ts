import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, TIME_JITTER, verify } from '~/kit';

/**
 * Foundation Test 08: Foreach Dynamic Spawn
 *
 * Tests dynamic token spawning based on collection size using `foreach` on transitions.
 * Unlike `spawnCount` (static number), `foreach` reads an array from context at runtime
 * and spawns one token per item.
 *
 * FOREACH SEMANTICS:
 * - `foreach.collection`: Path to array in context (e.g., 'input.items' or 'state.tasks')
 * - `foreach.itemVar`: Variable name for accessing current item (reserved for future use)
 * - Spawn count = collection.length at evaluation time
 * - Each spawned token has branchIndex (0, 1, 2, ...) for accessing its item
 *
 * WHAT THIS TEST VALIDATES:
 * 1. Dynamic spawn count based on runtime collection length
 * 2. Foreach reading from input context (most common pattern)
 * 3. Foreach reading from state context (data produced by previous node)
 * 4. Different collection sizes (3, 5, 1 items)
 * 5. Empty collection edge case (0 items → no tokens spawned)
 * 6. branchIndex correctly identifies which item each token handles
 * 7. Fan-in synchronization works with dynamic spawn counts
 *
 * COMPARISON WITH TEST 02:
 * - Test 02: Uses spawnCount: 3 (static, known at definition time)
 * - Test 08: Uses foreach (dynamic, determined at runtime from data)
 */

describe('Foundation: 08 - Foreach Dynamic Spawn', () => {
  /**
   * Test: Foreach from input.items (3 items)
   *
   * Workflow structure:
   *   [dispatch] → (foreach: input.items) → [process] ×3 → (fan-in) → [summarize]
   *
   * This is the most common foreach pattern: the workflow receives a collection
   * in its input and immediately fans out to process each item.
   */
  it('spawns tokens dynamically from input array (3 items)', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      items: s.array(s.string()),
    });

    const dispatchOutputSchema = s.object(
      { dispatched: s.boolean() },
      { required: ['dispatched'] },
    );

    const processOutputSchema = s.object(
      { processed: s.string() },
      { required: ['processed'] },
    );

    const summarizeOutputSchema = s.object(
      { summary: s.string() },
      { required: ['summary'] },
    );

    const contextSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    const workflowOutputSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    // =========================================================================
    // Node: dispatch (entry point, triggers foreach)
    // =========================================================================
    const dispatchAction = action({
      name: 'Dispatch Action',
      description: 'Prepares for parallel processing',
      kind: 'context',
      implementation: {},
    });

    const dispatchStep = step({
      ref: 'dispatch_step',
      ordinal: 0,
      action: dispatchAction,
      inputMapping: {},
      outputMapping: { 'output.dispatched': 'true' },
    });

    const dispatchTask = task({
      name: 'Dispatch Task',
      description: 'Dispatch items for processing',
      inputSchema: s.object({}),
      outputSchema: dispatchOutputSchema,
      steps: [dispatchStep],
    });

    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: dispatchTask,
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Node: process (runs N times based on input.items.length)
    // =========================================================================
    const processAction = action({
      name: 'Process Action',
      description: 'Process a single item',
      kind: 'mock',
      implementation: {
        schema: processOutputSchema,
        options: { stringMode: 'words', delay: TIME_JITTER },
      },
    });

    const processStep = step({
      ref: 'process_step',
      ordinal: 0,
      action: processAction,
      inputMapping: {},
      outputMapping: { 'output.processed': 'result.processed' },
    });

    const processTask = task({
      name: 'Process Task',
      description: 'Process one item from the collection',
      inputSchema: s.object({ item: s.string() }),
      outputSchema: processOutputSchema,
      steps: [processStep],
    });

    const processNode = node({
      ref: 'process',
      name: 'Process',
      task: processTask,
      taskVersion: 1,
      // Each branch receives the item at its branchIndex from input
      inputMapping: { item: 'input.items[_branch.index]' },
      outputMapping: { 'output.processed': 'result.processed' },
    });

    // =========================================================================
    // Node: summarize
    // =========================================================================
    const summarizeAction = action({
      name: 'Summarize Action',
      description: 'Summarize all processed results',
      kind: 'mock',
      implementation: {
        schema: summarizeOutputSchema,
        options: { stringMode: 'words' },
      },
    });

    const summarizeStep = step({
      ref: 'summarize_step',
      ordinal: 0,
      action: summarizeAction,
      inputMapping: {},
      outputMapping: { 'output.summary': 'result.summary' },
    });

    const summarizeTask = task({
      name: 'Summarize Task',
      description: 'Produce summary from all processed items',
      inputSchema: s.object({ results: s.array(s.string()) }),
      outputSchema: summarizeOutputSchema,
      steps: [summarizeStep],
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: summarizeTask,
      taskVersion: 1,
      inputMapping: { results: 'state.results' },
      outputMapping: { 'state.summary': 'result.summary' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Foreach: spawn one token per item in input.items
    const foreachTransition = transition({
      ref: 'foreach_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        collection: 'input.items',
        itemVar: 'item',
      },
      siblingGroup: 'process_group',
    });

    // Fan-in: wait for all process branches, merge results
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'process',
      toNodeRef: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'process_group',
        merge: {
          source: '_branch.output.processed',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const workflowDef = workflow({
      name: 'Foreach From Input Test',
      description: 'Foundation test 08 - foreach spawns based on input array',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        results: 'state.results',
        summary: 'state.summary',
      },
      initialNodeRef: 'dispatch',
      nodes: [dispatchNode, processNode, summarizeNode],
      transitions: [foreachTransition, fanInTransition],
    });

    // =========================================================================
    // Execute with 3 items
    // =========================================================================
    const workflowInput = { items: ['apple', 'banana', 'cherry'] };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // Token structure:
        // - 1 dispatch token (root)
        // - 3 process tokens (foreach spawns based on input.items.length)
        // - 3 fan-in arrival tokens (all siblings create arrivals)
        // - 1 summarize continuation token
        // Total: 1 + 3 + 3 + 1 = 8
        root: 1,
        fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['processed'] }],
        fanInArrivals: 3,
        fanInContinuations: 1,
        total: 8,
      })
      .withStateWriteOrder(['state.results', 'state.summary'])
      .withStateWrites([
        {
          path: 'state.results',
          type: 'array',
          arrayLength: 3,
          description: 'Fan-in merged results from 3 branches',
        },
        {
          path: 'state.summary',
          type: 'string',
          description: 'Summary from summarize node',
        },
      ])
      .withBranchWrites({
        uniqueTokenCount: 3,
      })
      .withOutput({
        results: { type: 'array', arrayLength: 3 },
        summary: { type: 'string', defined: true },
      })
      .run();
  });

  /**
   * Test: Foreach with 5 items
   *
   * Validates that foreach correctly handles different collection sizes.
   */
  it('spawns tokens dynamically with 5 items', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      items: s.array(s.string()),
    });

    const dispatchOutputSchema = s.object(
      { dispatched: s.boolean() },
      { required: ['dispatched'] },
    );

    const processOutputSchema = s.object(
      { processed: s.string() },
      { required: ['processed'] },
    );

    const summarizeOutputSchema = s.object(
      { summary: s.string() },
      { required: ['summary'] },
    );

    const contextSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    const workflowOutputSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    // =========================================================================
    // Nodes (same structure as above)
    // =========================================================================
    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: task({
        name: 'Dispatch Task',
        description: 'Dispatch items',
        inputSchema: s.object({}),
        outputSchema: dispatchOutputSchema,
        steps: [
          step({
            ref: 'dispatch_step',
            ordinal: 0,
            action: action({
              name: 'Dispatch Action',
              description: 'Dispatch',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.dispatched': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const processNode = node({
      ref: 'process',
      name: 'Process',
      task: task({
        name: 'Process Task',
        description: 'Process one item',
        inputSchema: s.object({ item: s.string() }),
        outputSchema: processOutputSchema,
        steps: [
          step({
            ref: 'process_step',
            ordinal: 0,
            action: action({
              name: 'Process Action',
              description: 'Process',
              kind: 'mock',
              implementation: {
                schema: processOutputSchema,
                options: { stringMode: 'words', delay: TIME_JITTER },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.processed': 'result.processed' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { item: 'input.items[_branch.index]' },
      outputMapping: { 'output.processed': 'result.processed' },
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: task({
        name: 'Summarize Task',
        description: 'Summarize results',
        inputSchema: s.object({ results: s.array(s.string()) }),
        outputSchema: summarizeOutputSchema,
        steps: [
          step({
            ref: 'summarize_step',
            ordinal: 0,
            action: action({
              name: 'Summarize Action',
              description: 'Summarize',
              kind: 'mock',
              implementation: {
                schema: summarizeOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.summary': 'result.summary' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { results: 'state.results' },
      outputMapping: { 'state.summary': 'result.summary' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const foreachTransition = transition({
      ref: 'foreach_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        collection: 'input.items',
        itemVar: 'item',
      },
      siblingGroup: 'process_group',
    });

    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'process',
      toNodeRef: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'process_group',
        merge: {
          source: '_branch.output.processed',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'Foreach 5 Items Test',
      description: 'Foundation test 08 - foreach with 5 items',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        results: 'state.results',
        summary: 'state.summary',
      },
      initialNodeRef: 'dispatch',
      nodes: [dispatchNode, processNode, summarizeNode],
      transitions: [foreachTransition, fanInTransition],
    });

    // =========================================================================
    // Execute with 5 items
    // =========================================================================
    const workflowInput = { items: ['one', 'two', 'three', 'four', 'five'] };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // 1 dispatch + 5 process + 5 arrivals + 1 summarize = 12
        root: 1,
        fanOuts: [{ count: 5, branchTotal: 5, outputFields: ['processed'] }],
        fanInArrivals: 5,
        fanInContinuations: 1,
        total: 12,
      })
      .withOutput({
        results: { type: 'array', arrayLength: 5 },
        summary: { type: 'string', defined: true },
      })
      .run();
  });

  /**
   * Test: Foreach with single item
   *
   * Edge case: collection has only 1 item. The coordinator still uses fan-out
   * machinery (siblingGroup, branch tables), but branchTotal=1 means it
   * behaves effectively like a linear flow.
   *
   * Note: The verifier doesn't classify branchTotal=1 as a "fan-out" since
   * there's no actual parallelism. Tokens still flow through branch tables
   * but appear as sequential execution in the token structure.
   */
  it('spawns single token when collection has 1 item', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      items: s.array(s.string()),
    });

    const dispatchOutputSchema = s.object(
      { dispatched: s.boolean() },
      { required: ['dispatched'] },
    );

    const processOutputSchema = s.object(
      { processed: s.string() },
      { required: ['processed'] },
    );

    const summarizeOutputSchema = s.object(
      { summary: s.string() },
      { required: ['summary'] },
    );

    const contextSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    const workflowOutputSchema = s.object({
      results: s.array(s.string()),
      summary: s.string(),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: task({
        name: 'Dispatch Task',
        description: 'Dispatch',
        inputSchema: s.object({}),
        outputSchema: dispatchOutputSchema,
        steps: [
          step({
            ref: 'dispatch_step',
            ordinal: 0,
            action: action({
              name: 'Dispatch Action',
              description: 'Dispatch',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.dispatched': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const processNode = node({
      ref: 'process',
      name: 'Process',
      task: task({
        name: 'Process Task',
        description: 'Process',
        inputSchema: s.object({ item: s.string() }),
        outputSchema: processOutputSchema,
        steps: [
          step({
            ref: 'process_step',
            ordinal: 0,
            action: action({
              name: 'Process Action',
              description: 'Process',
              kind: 'mock',
              implementation: {
                schema: processOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.processed': 'result.processed' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { item: 'input.items[_branch.index]' },
      outputMapping: { 'output.processed': 'result.processed' },
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: task({
        name: 'Summarize Task',
        description: 'Summarize',
        inputSchema: s.object({ results: s.array(s.string()) }),
        outputSchema: summarizeOutputSchema,
        steps: [
          step({
            ref: 'summarize_step',
            ordinal: 0,
            action: action({
              name: 'Summarize Action',
              description: 'Summarize',
              kind: 'mock',
              implementation: {
                schema: summarizeOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.summary': 'result.summary' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { results: 'state.results' },
      outputMapping: { 'state.summary': 'result.summary' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const foreachTransition = transition({
      ref: 'foreach_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        collection: 'input.items',
        itemVar: 'item',
      },
      siblingGroup: 'process_group',
    });

    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'process',
      toNodeRef: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'process_group',
        merge: {
          source: '_branch.output.processed',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'Foreach Single Item Test',
      description: 'Foundation test 08 - single item collection',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        results: 'state.results',
        summary: 'state.summary',
      },
      initialNodeRef: 'dispatch',
      nodes: [dispatchNode, processNode, summarizeNode],
      transitions: [foreachTransition, fanInTransition],
    });

    // =========================================================================
    // Execute with 1 item
    // =========================================================================
    const workflowInput = { items: ['solo'] };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // With branchTotal=1, the verifier doesn't classify this as a fan-out.
    // Tokens still flow through branch tables but appear sequential.
    // Structure: dispatch(root) → process(root) → arrival(root) → summarize(continuation)
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // With single item, branchTotal=1, so verifier sees:
        // - 3 "root" path tokens (dispatch, process, arrival all have pathId=root)
        // - 1 continuation token (summarize has pathId=process_group:...)
        // No fan-outs detected since branchTotal <= 1
        root: 3,
        fanInContinuations: 1,
        total: 4,
      })
      .withOutput({
        results: { type: 'array', arrayLength: 1 },
        summary: { type: 'string', defined: true },
      })
      .run();
  });

  /**
   * Test: Foreach with empty collection
   *
   * Edge case: collection is empty. Foreach should spawn 0 tokens.
   * Workflow should complete after dispatch (no transitions fire).
   */
  it('handles empty collection (0 items) - completes without processing', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      items: s.array(s.string()),
    });

    const dispatchOutputSchema = s.object(
      { dispatched: s.boolean() },
      { required: ['dispatched'] },
    );

    const processOutputSchema = s.object(
      { processed: s.string() },
      { required: ['processed'] },
    );

    const contextSchema = s.object({
      results: s.array(s.string()),
    });

    const workflowOutputSchema = s.object({
      dispatched: s.boolean(),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: task({
        name: 'Dispatch Task',
        description: 'Dispatch',
        inputSchema: s.object({}),
        outputSchema: dispatchOutputSchema,
        steps: [
          step({
            ref: 'dispatch_step',
            ordinal: 0,
            action: action({
              name: 'Dispatch Action',
              description: 'Dispatch',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.dispatched': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'output.dispatched': 'result.dispatched' },
    });

    // Process node exists but should never be reached
    const processNode = node({
      ref: 'process',
      name: 'Process',
      task: task({
        name: 'Process Task',
        description: 'Process',
        inputSchema: s.object({ item: s.string() }),
        outputSchema: processOutputSchema,
        steps: [
          step({
            ref: 'process_step',
            ordinal: 0,
            action: action({
              name: 'Process Action',
              description: 'Process',
              kind: 'mock',
              implementation: {
                schema: processOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.processed': 'result.processed' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { item: 'input.items[_branch.index]' },
      outputMapping: { 'output.processed': 'result.processed' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    // Foreach with empty array should create 0 tokens
    const foreachTransition = transition({
      ref: 'foreach_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        collection: 'input.items',
        itemVar: 'item',
      },
      siblingGroup: 'process_group',
    });

    const workflowDef = workflow({
      name: 'Foreach Empty Collection Test',
      description: 'Foundation test 08 - empty collection edge case',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        dispatched: 'output.dispatched',
      },
      initialNodeRef: 'dispatch',
      nodes: [dispatchNode, processNode],
      transitions: [foreachTransition],
    });

    // =========================================================================
    // Execute with 0 items
    // =========================================================================
    const workflowInput = { items: [] as string[] };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // With empty array, foreach spawns 0 tokens
    // Workflow completes after dispatch (no outgoing transitions fire)
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // Only dispatch token - no process tokens spawned
        root: 1,
        total: 1,
      })
      .withOutput({
        dispatched: { type: 'boolean', value: true },
      })
      .run();
  });

  /**
   * Test: Foreach from state (produced by previous node)
   *
   * Workflow structure:
   *   [generate] → [dispatch] → (foreach: state.tasks) → [execute] ×N → (fan-in) → [complete]
   *
   * The generate node produces data that is written to state.tasks.
   * The foreach then reads from state.tasks (not input).
   * This validates that foreach works with dynamically-generated collections.
   */
  it('spawns tokens from state produced by previous node', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      taskCount: s.number(),
    });

    // Generate node produces an array of tasks
    const generateOutputSchema = s.object(
      { tasks: s.array(s.string()) },
      { required: ['tasks'] },
    );

    const dispatchOutputSchema = s.object(
      { dispatched: s.boolean() },
      { required: ['dispatched'] },
    );

    const executeOutputSchema = s.object(
      { result: s.string() },
      { required: ['result'] },
    );

    const completeOutputSchema = s.object(
      { completed: s.boolean() },
      { required: ['completed'] },
    );

    const contextSchema = s.object({
      tasks: s.array(s.string()),
      results: s.array(s.string()),
    });

    const workflowOutputSchema = s.object({
      tasks: s.array(s.string()),
      results: s.array(s.string()),
    });

    // =========================================================================
    // Node: generate (produces tasks array)
    // =========================================================================
    const generateNode = node({
      ref: 'generate',
      name: 'Generate',
      task: task({
        name: 'Generate Task',
        description: 'Generate task list',
        inputSchema: s.object({ count: s.number() }),
        outputSchema: generateOutputSchema,
        steps: [
          step({
            ref: 'generate_step',
            ordinal: 0,
            action: action({
              name: 'Generate Action',
              description: 'Generate tasks',
              kind: 'mock',
              implementation: {
                schema: generateOutputSchema,
                options: {
                  stringMode: 'words',
                  // Mock will generate array based on schema
                  arrayLength: { min: 4, max: 4 }, // Fixed length for predictable testing
                },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.tasks': 'result.tasks' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { count: 'input.taskCount' },
      // Write generated tasks to state
      outputMapping: { 'state.tasks': 'result.tasks' },
    });

    // =========================================================================
    // Node: dispatch (triggers foreach from state.tasks)
    // =========================================================================
    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: task({
        name: 'Dispatch Task',
        description: 'Dispatch tasks',
        inputSchema: s.object({}),
        outputSchema: dispatchOutputSchema,
        steps: [
          step({
            ref: 'dispatch_step',
            ordinal: 0,
            action: action({
              name: 'Dispatch Action',
              description: 'Dispatch',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.dispatched': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Node: execute (runs N times based on state.tasks.length)
    // =========================================================================
    const executeNode = node({
      ref: 'execute',
      name: 'Execute',
      task: task({
        name: 'Execute Task',
        description: 'Execute one task',
        inputSchema: s.object({ taskName: s.string() }),
        outputSchema: executeOutputSchema,
        steps: [
          step({
            ref: 'execute_step',
            ordinal: 0,
            action: action({
              name: 'Execute Action',
              description: 'Execute',
              kind: 'mock',
              implementation: {
                schema: executeOutputSchema,
                options: { stringMode: 'words', delay: TIME_JITTER },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
          }),
        ],
      }),
      taskVersion: 1,
      // Read task name from STATE (not input) at branch index
      inputMapping: { taskName: 'state.tasks[_branch.index]' },
      outputMapping: { 'output.result': 'result.result' },
    });

    // =========================================================================
    // Node: complete
    // =========================================================================
    const completeNode = node({
      ref: 'complete',
      name: 'Complete',
      task: task({
        name: 'Complete Task',
        description: 'Complete workflow',
        inputSchema: s.object({}),
        outputSchema: completeOutputSchema,
        steps: [
          step({
            ref: 'complete_step',
            ordinal: 0,
            action: action({
              name: 'Complete Action',
              description: 'Complete',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.completed': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const generateToDispatch = transition({
      ref: 'generate_to_dispatch',
      fromNodeRef: 'generate',
      toNodeRef: 'dispatch',
      priority: 1,
    });

    // Foreach reads from STATE (data produced by generate node)
    const foreachTransition = transition({
      ref: 'foreach_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'execute',
      priority: 1,
      foreach: {
        collection: 'state.tasks', // Reading from STATE, not input
        itemVar: 'task',
      },
      siblingGroup: 'execute_group',
    });

    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'execute',
      toNodeRef: 'complete',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'execute_group',
        merge: {
          source: '_branch.output.result',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'Foreach From State Test',
      description: 'Foundation test 08 - foreach reads from state produced by previous node',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        tasks: 'state.tasks',
        results: 'state.results',
      },
      initialNodeRef: 'generate',
      nodes: [generateNode, dispatchNode, executeNode, completeNode],
      transitions: [generateToDispatch, foreachTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { taskCount: 4 };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // Token structure:
        // - 1 generate token
        // - 1 dispatch token
        // - 4 execute tokens (foreach from state.tasks with 4 items)
        // - 4 fan-in arrival tokens
        // - 1 complete continuation token
        // Total: 1 + 1 + 4 + 4 + 1 = 11
        root: 2, // generate and dispatch are both root-path tokens
        fanOuts: [{ count: 4, branchTotal: 4, outputFields: ['result'] }],
        fanInArrivals: 4,
        fanInContinuations: 1,
        total: 11,
      })
      .withStateWriteOrder(['state.tasks', 'state.results'])
      .withStateWrites([
        {
          path: 'state.tasks',
          type: 'array',
          arrayLength: 4,
          description: 'Tasks generated by generate node',
        },
        {
          path: 'state.results',
          type: 'array',
          arrayLength: 4,
          description: 'Results from fan-in merge',
        },
      ])
      .withOutput({
        tasks: { type: 'array', arrayLength: 4 },
        results: { type: 'array', arrayLength: 4 },
      })
      .run();
  });
});
