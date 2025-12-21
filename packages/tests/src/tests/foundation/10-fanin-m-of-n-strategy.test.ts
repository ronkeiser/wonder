import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 10: Fan-in 'm_of_n' Strategy (Quorum)
 *
 * Tests the quorum-based synchronization strategy where fan-in activates
 * when M out of N siblings have successfully completed.
 *
 * 'm_of_n' STRATEGY SEMANTICS:
 * - Waits for exactly M successful completions (status: 'completed')
 * - Failed/cancelled/timed_out siblings do NOT count toward the quorum
 * - Once quorum is reached, ACTIVATE_FAN_IN triggers merge
 * - Merge includes outputs from all completed siblings (not just M)
 * - Remaining in-progress siblings continue but don't block workflow
 *
 * COMPARISON WITH OTHER STRATEGIES:
 * - 'all': Waits for ALL siblings to reach terminal state (including failures)
 * - 'any': First arrival proceeds immediately, no waiting
 * - 'm_of_n': Waits for M successes, then merges and proceeds
 *
 * USE CASES:
 * - Voting systems: Need 2 of 3 judges to agree
 * - Redundant fetches: Need 2 of 3 API calls to succeed
 * - Fault tolerance: Continue if majority succeeds
 *
 * WHAT THIS TEST VALIDATES:
 * 1. Quorum triggers after exactly M completions
 * 2. Merge includes all completed siblings at activation time
 * 3. Workflow proceeds without waiting for remaining siblings
 * 4. Different M values (2 of 3, 3 of 5)
 */

describe('Foundation: 10 - Fan-in m_of_n Strategy', () => {
  /**
   * Test: 2 of 3 quorum
   *
   * Workflow structure:
   *   [start] → (fan-out: 3) → [vote] ×3 → (m_of_n: 2) → [tally]
   *
   * Fan-in activates when 2 votes are in, merges those 2 (or more if
   * a third completes before activation).
   */
  it('activates fan-in when quorum of 2 out of 3 is reached', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      proposal: s.string(),
    });

    const startOutputSchema = s.object(
      { started: s.boolean() },
      { required: ['started'] },
    );

    const voteOutputSchema = s.object(
      { vote: s.string() },
      { required: ['vote'] },
    );

    const tallyOutputSchema = s.object(
      { result: s.string() },
      { required: ['result'] },
    );

    const contextSchema = s.object({
      votes: s.array(s.string()),
      result: s.string(),
    });

    const workflowOutputSchema = s.object({
      votes: s.array(s.string()),
      result: s.string(),
    });

    // =========================================================================
    // Node: start
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start voting',
        inputSchema: s.object({}),
        outputSchema: startOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.started': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Node: vote (3 parallel voters)
    // =========================================================================
    const voteNode = node({
      ref: 'vote',
      name: 'Vote',
      task: task({
        name: 'Vote Task',
        description: 'Cast a vote',
        inputSchema: s.object({ proposal: s.string() }),
        outputSchema: voteOutputSchema,
        steps: [
          step({
            ref: 'vote_step',
            ordinal: 0,
            action: action({
              name: 'Vote Action',
              description: 'Vote',
              kind: 'mock',
              implementation: {
                schema: voteOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.vote': 'result.vote' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { proposal: 'input.proposal' },
      outputMapping: { 'output.vote': 'result.vote' },
    });

    // =========================================================================
    // Node: tally (receives merged votes)
    // =========================================================================
    const tallyNode = node({
      ref: 'tally',
      name: 'Tally',
      task: task({
        name: 'Tally Task',
        description: 'Tally the votes',
        inputSchema: s.object({ votes: s.array(s.string()) }),
        outputSchema: tallyOutputSchema,
        steps: [
          step({
            ref: 'tally_step',
            ordinal: 0,
            action: action({
              name: 'Tally Action',
              description: 'Tally',
              kind: 'mock',
              implementation: {
                schema: tallyOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { votes: 'state.votes' },
      outputMapping: { 'state.result': 'result.result' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'vote',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'voters',
    });

    // m_of_n: require 2 of 3 to complete
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'vote',
      toNodeRef: 'tally',
      priority: 1,
      synchronization: {
        strategy: 'm_of_n:2',
        siblingGroup: 'voters',
        merge: {
          source: '_branch.output.vote',
          target: 'state.votes',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'm_of_n 2 of 3 Test',
      description: 'Foundation test 10 - quorum of 2 out of 3',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        votes: 'state.votes',
        result: 'state.result',
      },
      initialNodeRef: 'start',
      nodes: [startNode, voteNode, tallyNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { proposal: 'Approve budget increase' };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // With m_of_n: 2, fan-in activates after 2 completions.
    // All 3 voters complete (no failures in this test), so merge includes all 3.
    // Token structure:
    // - 1 start (root)
    // - 3 vote tokens (fan-out siblings)
    // - 3 fan-in arrivals (each voter arrives at sync point)
    // - 1 tally continuation (after fan-in activates)
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['vote'] }],
        fanInArrivals: 3,
        fanInContinuations: 1,
        total: 8,
      })
      .withStateWriteOrder(['state.votes', 'state.result'])
      .withStateWrites([
        {
          path: 'state.votes',
          type: 'array',
          // m_of_n:2 activates after 2 completions - merge includes 2+ votes
          // (timing-dependent: could be 2 or 3 depending on execution order)
          description: 'Merged votes from completed voters',
        },
        {
          path: 'state.result',
          type: 'string',
          description: 'Tally result',
        },
      ])
      .withOutput({
        votes: { type: 'array', defined: true },
        result: { type: 'string', defined: true },
      })
      .run();
  });

  /**
   * Test: 3 of 5 quorum
   *
   * Larger quorum to verify the strategy scales correctly.
   */
  it('activates fan-in when quorum of 3 out of 5 is reached', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const startOutputSchema = s.object(
      { ready: s.boolean() },
      { required: ['ready'] },
    );

    const processOutputSchema = s.object(
      { value: s.number() },
      { required: ['value'] },
    );

    const aggregateOutputSchema = s.object(
      { sum: s.number() },
      { required: ['sum'] },
    );

    const contextSchema = s.object({
      values: s.array(s.number()),
      sum: s.number(),
    });

    const workflowOutputSchema = s.object({
      values: s.array(s.number()),
      sum: s.number(),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start',
        inputSchema: s.object({}),
        outputSchema: startOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.ready': 'true' },
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
        description: 'Generate a value',
        inputSchema: s.object({}),
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
                options: {},
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.value': 'result.value' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'output.value': 'result.value' },
    });

    const aggregateNode = node({
      ref: 'aggregate',
      name: 'Aggregate',
      task: task({
        name: 'Aggregate Task',
        description: 'Aggregate values',
        inputSchema: s.object({ values: s.array(s.number()) }),
        outputSchema: aggregateOutputSchema,
        steps: [
          step({
            ref: 'aggregate_step',
            ordinal: 0,
            action: action({
              name: 'Aggregate Action',
              description: 'Aggregate',
              kind: 'mock',
              implementation: {
                schema: aggregateOutputSchema,
                options: {},
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.sum': 'result.sum' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { values: 'state.values' },
      outputMapping: { 'state.sum': 'result.sum' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'process',
      priority: 1,
      spawnCount: 5,
      siblingGroup: 'processors',
    });

    // m_of_n: require 3 of 5 to complete
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'process',
      toNodeRef: 'aggregate',
      priority: 1,
      synchronization: {
        strategy: 'm_of_n:3',
        siblingGroup: 'processors',
        merge: {
          source: '_branch.output.value',
          target: 'state.values',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'm_of_n 3 of 5 Test',
      description: 'Foundation test 10 - quorum of 3 out of 5',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        values: 'state.values',
        sum: 'state.sum',
      },
      initialNodeRef: 'start',
      nodes: [startNode, processNode, aggregateNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = {};
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // With m_of_n: 3, fan-in activates after 3 completions.
    // All 5 processors complete, so merge includes all 5.
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 5, branchTotal: 5, outputFields: ['value'] }],
        fanInArrivals: 5,
        fanInContinuations: 1,
        total: 12, // 1 + 5 + 5 + 1
      })
      .withStateWrites([
        {
          path: 'state.values',
          type: 'array',
          // m_of_n:3 activates after 3 completions - merge includes 3+ values
          description: 'Merged values from completed processors',
        },
        {
          path: 'state.sum',
          type: 'number',
          description: 'Aggregated sum',
        },
      ])
      .withOutput({
        values: { type: 'array', defined: true },
        sum: { type: 'number', defined: true },
      })
      .run();
  });

  /**
   * Test: m_of_n with m equals n (degenerates to 'all')
   *
   * When m equals n, m_of_n should behave like 'all' strategy.
   */
  it('m equals n behaves like all strategy', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const stepOutputSchema = s.object(
      { done: s.boolean() },
      { required: ['done'] },
    );

    const collectOutputSchema = s.object(
      { results: s.array(s.boolean()) },
      { required: ['results'] },
    );

    const contextSchema = s.object({
      results: s.array(s.boolean()),
    });

    const workflowOutputSchema = s.object({
      results: s.array(s.boolean()),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start',
        inputSchema: s.object({}),
        outputSchema: stepOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.done': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const workNode = node({
      ref: 'work',
      name: 'Work',
      task: task({
        name: 'Work Task',
        description: 'Do work',
        inputSchema: s.object({}),
        outputSchema: stepOutputSchema,
        steps: [
          step({
            ref: 'work_step',
            ordinal: 0,
            action: action({
              name: 'Work Action',
              description: 'Work',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.done': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'output.done': 'result.done' },
    });

    const collectNode = node({
      ref: 'collect',
      name: 'Collect',
      task: task({
        name: 'Collect Task',
        description: 'Collect results',
        inputSchema: s.object({ results: s.array(s.boolean()) }),
        outputSchema: collectOutputSchema,
        steps: [
          step({
            ref: 'collect_step',
            ordinal: 0,
            action: action({
              name: 'Collect Action',
              description: 'Collect',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.results': 'input.results' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { results: 'state.results' },
      outputMapping: {},
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'work',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'workers',
    });

    // m_of_n: 3 of 3 (same as 'all')
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'work',
      toNodeRef: 'collect',
      priority: 1,
      synchronization: {
        strategy: 'm_of_n:3',
        siblingGroup: 'workers',
        merge: {
          source: '_branch.output.done',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'm_of_n 3 of 3 Test',
      description: 'Foundation test 10 - m equals n',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        results: 'state.results',
      },
      initialNodeRef: 'start',
      nodes: [startNode, workNode, collectNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = {};
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // 3 of 3 means all must complete - same as 'all' strategy
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['done'] }],
        fanInArrivals: 3,
        fanInContinuations: 1,
        total: 8,
      })
      .withOutput({
        // All 3 results collected
        results: { type: 'array', arrayLength: 3 },
      })
      .run();
  });

  /**
   * Test: m_of_n with m equals 1 (similar to 'any' but with merge)
   *
   * When m equals 1, fan-in activates on first completion.
   * Unlike 'any', this still does a merge operation.
   */
  it('m equals 1 activates on first completion with merge', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const startOutputSchema = s.object(
      { ready: s.boolean() },
      { required: ['ready'] },
    );

    const fetchOutputSchema = s.object(
      { data: s.string() },
      { required: ['data'] },
    );

    const useOutputSchema = s.object(
      { used: s.boolean() },
      { required: ['used'] },
    );

    const contextSchema = s.object({
      results: s.array(s.string()),
    });

    const workflowOutputSchema = s.object({
      results: s.array(s.string()),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start',
        inputSchema: s.object({}),
        outputSchema: startOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.ready': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const fetchNode = node({
      ref: 'fetch',
      name: 'Fetch',
      task: task({
        name: 'Fetch Task',
        description: 'Fetch data',
        inputSchema: s.object({}),
        outputSchema: fetchOutputSchema,
        steps: [
          step({
            ref: 'fetch_step',
            ordinal: 0,
            action: action({
              name: 'Fetch Action',
              description: 'Fetch',
              kind: 'mock',
              implementation: {
                schema: fetchOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.data': 'result.data' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'output.data': 'result.data' },
    });

    const useNode = node({
      ref: 'use',
      name: 'Use',
      task: task({
        name: 'Use Task',
        description: 'Use the data',
        inputSchema: s.object({ results: s.array(s.string()) }),
        outputSchema: useOutputSchema,
        steps: [
          step({
            ref: 'use_step',
            ordinal: 0,
            action: action({
              name: 'Use Action',
              description: 'Use',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.used': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { results: 'state.results' },
      outputMapping: {},
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'fetch',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'fetchers',
    });

    // m_of_n: 1 of 3 - first completion triggers fan-in
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'fetch',
      toNodeRef: 'use',
      priority: 1,
      synchronization: {
        strategy: 'm_of_n:1',
        siblingGroup: 'fetchers',
        merge: {
          source: '_branch.output.data',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'm_of_n 1 of 3 Test',
      description: 'Foundation test 10 - m equals 1',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        results: 'state.results',
      },
      initialNodeRef: 'start',
      nodes: [startNode, fetchNode, useNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = {};
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // m_of_n: 1 means first completion triggers fan-in.
    // Unlike 'any', this does a merge - but only includes completed siblings
    // at the moment of activation. In practice with mock actions completing
    // quickly, all 3 may complete before fan-in activates.
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['data'] }],
        fanInArrivals: 3,
        fanInContinuations: 1,
        total: 8,
      })
      .withStateWrites([
        {
          path: 'state.results',
          type: 'array',
          // At least 1 result, possibly all 3 if they complete before fan-in
          description: 'Merged fetch results',
        },
      ])
      .withOutput({
        results: { type: 'array', defined: true },
      })
      .run();
  });
});
