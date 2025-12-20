import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, runTestWorkflow } from '~/kit';

/**
 * Foundation Test 01: Single Node Mock
 *
 * The simplest possible workflow: one node, one task, one step, one mock action.
 * This is the foundation upon which all other tests build.
 *
 * Workflow structure:
 *   [generate] → (complete)
 *
 * This proves:
 * 1. Workflow lifecycle: started → completed
 * 2. Token lifecycle: pending → dispatched → executing → completed
 * 3. Context initialization with input/state/output tables
 * 4. Task dispatch and result handling
 * 5. Output mapping from task → workflow context
 * 6. Completion extraction via outputMapping
 * 7. Decision Pattern architecture: Planning → Dispatch → Operations
 *
 * Assertion strategy:
 * - NO SEED: Mock generates random data
 * - RELATIONAL: Assert value at Point A === value at Point B
 * - STRUCTURAL: Assert token lifecycle, event counts
 * - ARCHITECTURAL: Assert decision planning, dispatch, and operation execution
 * - INVARIANTS: Assert global properties that must always hold
 */

// =============================================================================
// Test
// =============================================================================

describe('Foundation: 01 - Single Node Mock', () => {
  it('executes single node workflow with correct lifecycle and data flow', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});
    const mockOutputSchema = s.object({ code: s.string() }, { required: ['code'] });
    const workflowOutputSchema = s.object({ code: s.string() }, { required: ['code'] });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const generateAction = action({
      name: 'Generate Code',
      description: 'Generates a random 6-character code',
      kind: 'mock',
      implementation: { schema: mockOutputSchema, options: { stringMode: 'words' } },
    });

    const generateStep = step({
      ref: 'generate_step',
      ordinal: 0,
      action: generateAction,
      inputMapping: {},
      outputMapping: { 'output.code': '$.code' },
    });

    const generateTask = task({
      name: 'Generate Task',
      description: 'Generates random code',
      inputSchema: s.object({}),
      outputSchema: mockOutputSchema,
      steps: [generateStep],
    });

    const generateNode = node({
      ref: 'generate',
      name: 'Generate',
      task: generateTask,
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'output.code': '$.code' },
    });

    const workflowDef = workflow({
      name: 'Single Node Mock Test',
      description: 'Foundation test 01 - single node lifecycle',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      outputMapping: { code: '$.output.code' },
      initialNodeRef: 'generate',
      nodes: [generateNode],
      transitions: [],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const startTime = Date.now();
    const { result } = await runTestWorkflow(workflowDef, {});

    const { trace, events } = result;
      const elapsedMs = Date.now() - startTime;

      // =========================================================================
      // INVARIANTS
      // =========================================================================
      assertInvariants(trace);

      // =========================================================================
      // TIMING
      // =========================================================================
      expect(elapsedMs, 'Mock workflow should complete in under 10s').toBeLessThan(30000);

      // =========================================================================
      // WORKFLOW STATUS
      // =========================================================================
      expect(result.status).toBe('completed');

      // =========================================================================
      // WORKFLOW EVENTS (what users see)
      // =========================================================================
      const workflowStarted = events.find((e) => e.eventType === 'workflow.started');
      const workflowCompleted = events.find((e) => e.eventType === 'workflow.completed');
      const taskDispatched = events.find((e) => e.eventType === 'task.dispatched');
      const taskCompleted = events.find((e) => e.eventType === 'task.completed');

      expect(workflowStarted, 'workflow.started event must exist').toBeDefined();
      expect(workflowCompleted, 'workflow.completed event must exist').toBeDefined();
      expect(taskDispatched, 'task.dispatched event must exist').toBeDefined();
      expect(taskCompleted, 'task.completed event must exist').toBeDefined();

      // =========================================================================
      // TOKEN LIFECYCLE
      // =========================================================================
      const tokenCreations = trace.tokens.creations();
      expect(tokenCreations, 'Exactly one token should be created').toHaveLength(1);

      const rootToken = tokenCreations[0];
      expect(rootToken.tokenId, 'Root token must have tokenId').toBeDefined();
      const tokenId = rootToken.tokenId!;

      // Root token lineage
      expect(rootToken.payload.parentTokenId).toBeNull();
      expect(rootToken.payload.pathId, 'Root token pathId must be "root"').toBe('root');
      expect(rootToken.payload.branchIndex).toBe(0);
      expect(rootToken.payload.branchTotal).toBe(1);
      expect(rootToken.payload.siblingGroup).toBeNull();
      expect(rootToken.nodeId).toBeDefined();

      // Token state transitions
      const statuses = trace.tokens.statusTransitions(tokenId);
      expect(statuses).toEqual(['pending', 'dispatched', 'executing', 'completed']);

      // =========================================================================
      // CONTEXT INITIALIZATION
      // =========================================================================
      const contextInit = trace.context.initialize();
      expect(contextInit, 'Context initialization event must exist').toBeDefined();

      // Tables created
      const tablesCreated = contextInit!.payload.tablesCreated;
      expect(tablesCreated).toContain('context_input');
      expect(tablesCreated).toContain('context_output');
      expect(tablesCreated, 'No state table (no contextSchema)').not.toContain('context_state');

      // Input validated
      const inputValidation = trace.context.validateAt('input');
      expect(inputValidation, 'Input validation event must exist').toBeDefined();
      expect(inputValidation!.payload.valid).toBe(true);
      expect(inputValidation!.payload.errorCount).toBe(0);

      // =========================================================================
      // ROUTING
      // =========================================================================
      const routingCompletions = trace.routing.completions();
      expect(routingCompletions).toHaveLength(1);
      expect(
        routingCompletions[0].payload.decisions,
        'No routing decisions (no transitions)',
      ).toEqual([]);

      // =========================================================================
      // TASK DISPATCH
      // =========================================================================
      // Verify input mapping was applied
      const inputMappingEvent = trace.dispatch.taskDispatch(tokenId);
      expect(inputMappingEvent, 'Task input mapping event must exist').toBeDefined();
      expect(inputMappingEvent!.payload.inputMapping).toEqual({});
      expect(inputMappingEvent!.payload.taskInput).toEqual({});

      // Verify task was sent to executor with correct payload
      const taskSentEvent = trace.dispatch.send(tokenId);
      expect(taskSentEvent, 'Task sent event must exist').toBeDefined();
      expect(taskSentEvent!.payload.taskId, 'Task ID must be defined').toBeDefined();
      expect(taskSentEvent!.payload.taskVersion).toBe(1);
      expect(taskSentEvent!.payload.resources).toEqual({});

      // =========================================================================
      // EXECUTOR - Task Execution
      // =========================================================================
      const executorTaskStart = trace.executor.taskStart(tokenId);
      expect(executorTaskStart, 'Executor task started event must exist').toBeDefined();
      expect(executorTaskStart!.payload.taskId).toBe(taskSentEvent!.payload.taskId);
      expect(executorTaskStart!.payload.taskVersion).toBe(1);
      expect(executorTaskStart!.payload.stepCount).toBe(1);
      expect(executorTaskStart!.payload.inputKeys).toEqual([]);

      const executorTaskCompletion = trace.executor.taskCompletion(tokenId);
      expect(executorTaskCompletion, 'Executor task completed event must exist').toBeDefined();
      expect(executorTaskCompletion!.payload.taskId).toBe(taskSentEvent!.payload.taskId);
      expect(executorTaskCompletion!.payload.stepsExecuted).toBe(1);
      expect(executorTaskCompletion!.payload.stepsSkipped).toBe(0);
      expect(executorTaskCompletion!.durationMs).toBeGreaterThanOrEqual(0);

      // =========================================================================
      // EXECUTOR - Step Execution
      // =========================================================================
      const stepStarts = trace.executor.stepStartsFor(tokenId);
      expect(stepStarts, 'Exactly one step started').toHaveLength(1);
      expect(stepStarts[0].payload.stepRef).toBe('generate_step');
      expect(stepStarts[0].payload.stepOrdinal).toBe(0);
      expect(stepStarts[0].payload.hasCondition).toBe(false);

      const stepCompletions = trace.executor.stepCompletionsFor(tokenId);
      expect(stepCompletions, 'Exactly one step completed').toHaveLength(1);
      expect(stepCompletions[0].payload.stepRef).toBe('generate_step');
      expect(stepCompletions[0].payload.success).toBe(true);
      expect(stepCompletions[0].payload.outputKeys).toEqual(['code']);
      expect(stepCompletions[0].durationMs).toBeGreaterThanOrEqual(0);

      // =========================================================================
      // EXECUTOR - Action Execution
      // =========================================================================
      const actionStarts = trace.executor.actionStartsFor(tokenId);
      expect(actionStarts, 'Exactly one action started').toHaveLength(1);
      expect(actionStarts[0].payload.stepRef).toBe('generate_step');
      expect(actionStarts[0].payload.actionKind).toBe('mock');
      expect(actionStarts[0].payload.inputKeys).toEqual([]);

      const actionCompletions = trace.executor.actionCompletionsFor(tokenId);
      expect(actionCompletions, 'Exactly one action completed').toHaveLength(1);
      expect(actionCompletions[0].payload.stepRef).toBe('generate_step');
      expect(actionCompletions[0].payload.actionKind).toBe('mock');
      expect(actionCompletions[0].payload.outputKeys).toEqual(['code']);
      expect(actionCompletions[0].durationMs).toBeGreaterThanOrEqual(0);

      // =========================================================================
      // EXECUTOR - Mock Data Generation
      // =========================================================================
      const mockGeneration = trace.executor.mockGeneration(tokenId);
      expect(mockGeneration, 'Mock generation event must exist').toBeDefined();
      expect(mockGeneration!.payload.stepRef).toBe('generate_step');
      expect(mockGeneration!.payload.schemaType).toBe('object');
      expect(mockGeneration!.payload.hasSeed).toBe(false);
      expect(mockGeneration!.durationMs).toBeGreaterThanOrEqual(0);

      // =========================================================================
      // EXECUTOR - Causal Ordering
      // =========================================================================
      expect(executorTaskStart!.sequence).toBeLessThan(stepStarts[0].sequence);
      expect(stepStarts[0].sequence).toBeLessThan(actionStarts[0].sequence);
      expect(actionStarts[0].sequence).toBeLessThan(mockGeneration!.sequence);
      expect(mockGeneration!.sequence).toBeLessThan(actionCompletions[0].sequence);
      expect(actionCompletions[0].sequence).toBeLessThan(stepCompletions[0].sequence);
      expect(stepCompletions[0].sequence).toBeLessThan(executorTaskCompletion!.sequence);

      // =========================================================================
      // COMPLETION
      // =========================================================================
      const completionComplete = trace.completion.complete();
      expect(completionComplete, 'Completion event must exist').toBeDefined();

      const finalOutput = completionComplete!.payload.finalOutput as { code: string };
      expect(typeof finalOutput.code).toBe('string');
      expect(finalOutput.code.length, 'Code must be non-empty').toBeGreaterThan(0);

      // =========================================================================
      // RELATIONAL - Data flow verification
      // =========================================================================
      const outputWrite = trace.context.setFieldAt('output.code');
      expect(outputWrite, 'output.code write event must exist').toBeDefined();
      expect(finalOutput.code, 'Written value must equal final output').toBe(
        outputWrite!.payload.value,
      );

      // =========================================================================
      // CAUSAL ORDERING
      // =========================================================================
      const dispatchedEvent = trace.tokens.statusUpdate(tokenId, 'dispatched');
      const executingEvent = trace.tokens.statusUpdate(tokenId, 'executing');
      const completedEvent = trace.tokens.statusUpdate(tokenId, 'completed');

      expect(dispatchedEvent, 'dispatched event must exist').toBeDefined();
      expect(executingEvent, 'executing event must exist').toBeDefined();
      expect(completedEvent, 'completed event must exist').toBeDefined();

      // Verify causal chain
      expect(contextInit!.sequence).toBeLessThan(rootToken.sequence);
      expect(rootToken.sequence).toBeLessThan(dispatchedEvent!.sequence);
      expect(dispatchedEvent!.sequence).toBeLessThan(executingEvent!.sequence);
      expect(executingEvent!.sequence).toBeLessThan(completedEvent!.sequence);
      expect(completedEvent!.sequence).toBeLessThan(routingCompletions[0].sequence);
      expect(routingCompletions[0].sequence).toBeLessThan(completionComplete!.sequence);

      // =========================================================================
      // NEGATIVE ASSERTIONS
      // =========================================================================
      expect(trace.sync.all(), 'No sync events for linear workflow').toHaveLength(0);
      expect(trace.branches.creates(), 'No branch tables for linear workflow').toHaveLength(0);
      expect(trace.branches.writes(), 'No branch writes for linear workflow').toHaveLength(0);
      expect(trace.branches.merges(), 'No branch merges for linear workflow').toHaveLength(0);

      // =========================================================================
      // DECISION ARCHITECTURE (Planning → Dispatch → Operations)
      // =========================================================================
      // This validates the core Decision Pattern that makes Wonder unique:
      // Planning layer generates pure decisions, dispatch converts to operations

      // ROUTING PLANNING
      const routingPlanningStarts = trace.routing.starts();
      expect(routingPlanningStarts, 'Routing planning invoked').toHaveLength(1);
      expect(routingPlanningStarts[0].tokenId, 'Planning for completed token').toBe(tokenId);
      expect(routingPlanningStarts[0].nodeId, 'Planning has node context').toBeDefined();

      // No transitions should be evaluated (workflow has no outgoing transitions)
      const transitionEvaluations = trace.routing.evaluations();
      expect(transitionEvaluations, 'No transitions to evaluate').toHaveLength(0);

      const routingPlanningComplete = trace.routing.completions();
      expect(routingPlanningComplete, 'Routing completed with decisions').toHaveLength(1);
      expect(
        routingPlanningComplete[0].payload.decisions,
        'No routing decisions (no outgoing transitions)',
      ).toEqual([]);

      // COMPLETION PLANNING
      const completionPlanningStart = trace.completion.start();
      expect(completionPlanningStart, 'Completion planning started').toBeDefined();
      expect(completionPlanningStart!.payload.outputMapping).toEqual({ code: '$.output.code' });

      // Verify context structure available to planning
      const contextKeys = completionPlanningStart!.payload.contextKeys;
      expect(contextKeys.input, 'Input available to planning').toBeDefined();
      expect(contextKeys.state, 'State available to planning').toBeDefined();
      expect(contextKeys.output, 'Output available to planning').toBeDefined();
      expect(contextKeys.output, 'Output has code field').toContain('code');

      const completionPlanningExtracts = trace.completion.extracts();
      expect(completionPlanningExtracts, 'Output fields extracted via planning').toHaveLength(1);
      expect(completionPlanningExtracts[0].payload.targetField).toBe('code');
      expect(completionPlanningExtracts[0].payload.sourcePath).toBe('$.output.code');

      // RELATIONAL: Extracted value must match final output
      const extractedCode = completionPlanningExtracts[0].payload.extractedValue;
      expect(typeof extractedCode).toBe('string');
      expect((extractedCode as string).length).toBeGreaterThan(0);
      expect(extractedCode, 'Extracted value must equal final output').toBe(finalOutput.code);

      const completionPlanningComplete = trace.completion.complete();
      expect(completionPlanningComplete, 'Completion planning finished').toBeDefined();
      expect(completionPlanningComplete!.payload.finalOutput).toEqual({ code: finalOutput.code });

      // DISPATCH LAYER
      // The dispatch layer converts decisions into operations.
      // For this single-node workflow: initial token created at start, no routing decisions.
      const dispatchBatches = trace.dispatch.batchCompletes();
      expect(dispatchBatches.length, 'Dispatch batches executed').toBeGreaterThan(0);

      // Aggregate all batch results
      let totalApplied = 0;
      let totalTokensCreated = 0;
      let totalTokensDispatched = 0;
      let totalErrors = 0;
      for (const batch of dispatchBatches) {
        const payload = batch.payload as any;
        expect(payload.errors, `Batch errors`).toBe(0);
        totalApplied += payload.applied;
        totalTokensCreated += payload.tokensCreated;
        totalTokensDispatched += payload.tokensDispatched;
        totalErrors += payload.errors;
      }

      // SPEC: Single-node workflow decision flow
      // - Workflow start: CREATE_TOKEN decision for initial token
      // - Routing: No decisions (no outgoing transitions)
      // - No MARK_FOR_DISPATCH in decision layer (initial token dispatched separately)
      expect(totalTokensCreated, '1 token created via CREATE_TOKEN decision').toBe(1);
      expect(
        totalTokensDispatched,
        'No tokens dispatched via decisions (initial dispatch happens outside decision flow)',
      ).toBe(0);
      expect(totalErrors, 'No dispatch errors').toBe(0);
      expect(totalApplied, 'Decisions applied').toBeGreaterThan(0);

      // CONTEXT SNAPSHOTS (for planning layer)
      const contextSnapshots = trace.context.snapshots();
      expect(
        contextSnapshots.length,
        'Context snapshots created for decision logic',
      ).toBeGreaterThanOrEqual(1);

      // Verify snapshot used before routing planning (causal ordering)
      const snapshotBeforeRouting = contextSnapshots.find(
        (s) => s.sequence < routingPlanningStarts[0].sequence,
      );
      expect(snapshotBeforeRouting, 'Snapshot created before routing planning').toBeDefined();

      // Verify snapshot structure contains context sections
      const snapshot = contextSnapshots[0];
      expect(snapshot.payload.snapshot, 'Snapshot has context data').toBeDefined();
      expect(snapshot.payload.snapshot.input, 'Snapshot includes input').toBeDefined();
      expect(snapshot.payload.snapshot.output, 'Snapshot includes output').toBeDefined();

      // =========================================================================
      // EVENT MANIFEST
      // =========================================================================
      const expectedEvents: Record<string, number> = {
        // Context operations
        'operation.context.initialized': 1,
        'operation.context.validate': 1,
        'operation.context.section_replaced': 1,
        'operation.context.field_set': 1,
        // Token operations
        'operation.tokens.created': 1,
        'operation.tokens.status_updated': 3,
        // Decision layer - routing
        'decision.routing.start': 1,
        'decision.routing.complete': 1,
        // Decision layer - completion
        'decision.completion.start': 1,
        'decision.completion.extract': 1,
        'decision.completion.complete': 1,
        // Dispatch layer
        'dispatch.task.inputMapping.context': 1,
        'dispatch.task.inputMapping.applied': 1,
        'dispatch.task.sent': 1,
        // Executor operations
        'executor.task.started': 1,
        'executor.task.completed': 1,
        'executor.step.started': 1,
        'executor.step.completed': 1,
        'executor.action.started': 1,
        'executor.action.completed': 1,
        'executor.mock.generated': 1,
      };

      for (const [eventType, expectedCount] of Object.entries(expectedEvents)) {
        const actual = trace.byType(eventType).length;
        expect(actual, `Event '${eventType}': expected ${expectedCount}, got ${actual}`).toBe(
          expectedCount,
        );
      }
  });
});
