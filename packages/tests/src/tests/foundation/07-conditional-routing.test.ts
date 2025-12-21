import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 07: Conditional Routing
 *
 * This test validates the coordinator's condition evaluation and priority-based
 * routing logic. It proves that transitions are evaluated correctly based on
 * runtime context values and that priority tiers determine which path is taken.
 *
 * Workflow structure:
 *   [evaluate] → (if score >= 80) → [approve]   → [finalize]
 *              → (if score >= 50) → [review]    → [finalize]
 *              → (else)           → [reject]    → [finalize]
 *
 * Priority semantics:
 * - Priority 1: score >= 80 → approve
 * - Priority 2: score >= 50 → review
 * - Priority 3: unconditional → reject (fallback)
 *
 * The coordinator evaluates transitions by priority tier. Within a tier,
 * ALL matching transitions are followed. If any transition matches in a tier,
 * lower-priority tiers are NOT evaluated.
 *
 * WHAT THIS TEST VALIDATES:
 * 1. Comparison conditions with numeric operators (>=)
 * 2. Priority-based transition selection (first tier wins)
 * 3. Unconditional fallback transitions (no condition = always true)
 * 4. Single path selection (exactly one branch taken)
 * 5. Context-driven routing decisions
 * 6. Trace events for condition evaluation
 * 7. Routing decision events showing matched transitions
 *
 * TEST CASES:
 * - High score (85): approve path
 * - Medium score (65): review path
 * - Low score (30): reject path
 */

// =============================================================================
// Shared Definitions
// =============================================================================

const inputSchema = s.object({
  score: s.number(),
});

const evaluateOutputSchema = s.object(
  { score: s.number(), evaluated: s.boolean() },
  { required: ['score', 'evaluated'] },
);

const approveOutputSchema = s.object(
  { decision: s.string(), reason: s.string() },
  { required: ['decision', 'reason'] },
);

const reviewOutputSchema = s.object(
  { decision: s.string(), reason: s.string() },
  { required: ['decision', 'reason'] },
);

const rejectOutputSchema = s.object(
  { decision: s.string(), reason: s.string() },
  { required: ['decision', 'reason'] },
);

const finalizeOutputSchema = s.object(
  { finalDecision: s.string(), finalReason: s.string() },
  { required: ['finalDecision', 'finalReason'] },
);

const contextSchema = s.object({
  score: s.number(),
  decision: s.string(),
  reason: s.string(),
});

const workflowOutputSchema = s.object({
  score: s.number(),
  decision: s.string(),
  reason: s.string(),
});

// =============================================================================
// Node Builders
// =============================================================================

function buildEvaluateNode() {
  const evaluateAction = action({
    name: 'Evaluate Action',
    description: 'Passes score to context for routing decisions',
    kind: 'context',
    implementation: {},
  });

  const evaluateStep = step({
    ref: 'evaluate_step',
    ordinal: 0,
    action: evaluateAction,
    inputMapping: { score: 'input.score' },
    outputMapping: {
      'output.score': 'result.score',
      'output.evaluated': 'true',
    },
  });

  const evaluateTask = task({
    name: 'Evaluate Task',
    description: 'Evaluates input and prepares for routing',
    inputSchema: s.object({ score: s.number() }),
    outputSchema: evaluateOutputSchema,
    steps: [evaluateStep],
  });

  return node({
    ref: 'evaluate',
    name: 'Evaluate',
    task: evaluateTask,
    taskVersion: 1,
    inputMapping: { score: 'input.score' },
    outputMapping: { 'state.score': 'result.score' },
  });
}

function buildDecisionNode(
  ref: string,
  name: string,
  decision: string,
  reason: string,
  outputSchema: ReturnType<typeof s.object>,
) {
  const decisionAction = action({
    name: `${name} Action`,
    description: `Sets decision to ${decision}`,
    kind: 'context',
    implementation: {},
  });

  const decisionStep = step({
    ref: `${ref}_step`,
    ordinal: 0,
    action: decisionAction,
    inputMapping: {},
    outputMapping: {
      'output.decision': `'${decision}'`,
      'output.reason': `'${reason}'`,
    },
  });

  const decisionTask = task({
    name: `${name} Task`,
    description: `Produces ${decision} decision`,
    inputSchema: s.object({}),
    outputSchema: outputSchema,
    steps: [decisionStep],
  });

  return node({
    ref: ref,
    name: name,
    task: decisionTask,
    taskVersion: 1,
    inputMapping: {},
    outputMapping: {
      'state.decision': 'result.decision',
      'state.reason': 'result.reason',
    },
  });
}

function buildFinalizeNode() {
  const finalizeAction = action({
    name: 'Finalize Action',
    description: 'Copies decision from state to output',
    kind: 'context',
    implementation: {},
  });

  const finalizeStep = step({
    ref: 'finalize_step',
    ordinal: 0,
    action: finalizeAction,
    inputMapping: {
      decision: 'input.decision',
      reason: 'input.reason',
    },
    outputMapping: {
      'output.finalDecision': 'result.decision',
      'output.finalReason': 'result.reason',
    },
  });

  const finalizeTask = task({
    name: 'Finalize Task',
    description: 'Finalizes the workflow with decision',
    inputSchema: s.object({ decision: s.string(), reason: s.string() }),
    outputSchema: finalizeOutputSchema,
    steps: [finalizeStep],
  });

  return node({
    ref: 'finalize',
    name: 'Finalize',
    task: finalizeTask,
    taskVersion: 1,
    inputMapping: {
      decision: 'state.decision',
      reason: 'state.reason',
    },
    outputMapping: {},
  });
}

// =============================================================================
// Workflow Builder
// =============================================================================

function buildConditionalRoutingWorkflow() {
  const evaluateNode = buildEvaluateNode();
  const approveNode = buildDecisionNode(
    'approve',
    'Approve',
    'approved',
    'Score meets high threshold',
    approveOutputSchema,
  );
  const reviewNode = buildDecisionNode(
    'review',
    'Review',
    'needs_review',
    'Score is in review range',
    reviewOutputSchema,
  );
  const rejectNode = buildDecisionNode(
    'reject',
    'Reject',
    'rejected',
    'Score below threshold',
    rejectOutputSchema,
  );
  const finalizeNode = buildFinalizeNode();

  // Transitions with priority-based conditional routing
  // Priority 1: High score path (>= 80)
  const evaluateToApprove = transition({
    ref: 'evaluate_to_approve',
    fromNodeRef: 'evaluate',
    toNodeRef: 'approve',
    priority: 1,
    condition: 'state.score >= 80',
  });

  // Priority 2: Medium score path (>= 50, but priority ensures this only
  // fires if priority 1 didn't match)
  const evaluateToReview = transition({
    ref: 'evaluate_to_review',
    fromNodeRef: 'evaluate',
    toNodeRef: 'review',
    priority: 2,
    condition: 'state.score >= 50',
  });

  // Priority 3: Fallback path (unconditional)
  const evaluateToReject = transition({
    ref: 'evaluate_to_reject',
    fromNodeRef: 'evaluate',
    toNodeRef: 'reject',
    priority: 3,
    // No condition = unconditional = always matches
  });

  // All decision nodes converge to finalize
  const approveToFinalize = transition({
    ref: 'approve_to_finalize',
    fromNodeRef: 'approve',
    toNodeRef: 'finalize',
    priority: 1,
  });

  const reviewToFinalize = transition({
    ref: 'review_to_finalize',
    fromNodeRef: 'review',
    toNodeRef: 'finalize',
    priority: 1,
  });

  const rejectToFinalize = transition({
    ref: 'reject_to_finalize',
    fromNodeRef: 'reject',
    toNodeRef: 'finalize',
    priority: 1,
  });

  return workflow({
    name: 'Conditional Routing Test',
    description: 'Foundation test 07 - priority-based conditional routing',
    inputSchema: inputSchema,
    outputSchema: workflowOutputSchema,
    contextSchema: contextSchema,
    outputMapping: {
      score: 'state.score',
      decision: 'state.decision',
      reason: 'state.reason',
    },
    initialNodeRef: 'evaluate',
    nodes: [evaluateNode, approveNode, reviewNode, rejectNode, finalizeNode],
    transitions: [
      evaluateToApprove,
      evaluateToReview,
      evaluateToReject,
      approveToFinalize,
      reviewToFinalize,
      rejectToFinalize,
    ],
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Foundation: 07 - Conditional Routing', () => {
  it('routes to approve when score >= 80', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 85 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // WORKFLOW STATUS
    // =========================================================================
    expect(result.status).toBe('completed');

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        // Token structure:
        // All 3 tokens have pathId "root" because this is a linear workflow
        // (no fan-out). Fan-out would create paths like "root.nodeId.0"
        // - evaluate token (root)
        // - approve token (root, parent=evaluate)
        // - finalize token (root, parent=approve)
        root: 3,
        total: 3,
      })
      .withStateWrites([
        { path: 'state.score', type: 'number', description: 'Score from evaluate node' },
        { path: 'state.decision', type: 'string', description: 'Decision from approve node' },
        { path: 'state.reason', type: 'string', description: 'Reason from approve node' },
      ])
      .withOutput({
        score: { type: 'number', value: 85 },
        decision: { type: 'string', value: 'approved' },
        reason: { type: 'string', value: 'Score meets high threshold' },
      })
      .run();

    // =========================================================================
    // ROUTING DECISION VERIFICATION
    // =========================================================================
    // Verify the routing trace shows condition evaluation
    const routingStarts = trace.routing.starts();
    expect(routingStarts.length).toBeGreaterThanOrEqual(1);

    // Find the routing from evaluate node
    const evaluateRouting = routingStarts.find((r) => {
      // The routing should be for the evaluate token
      const token = trace.tokens.creations().find((t) => t.tokenId === r.tokenId);
      return token !== undefined;
    });
    expect(evaluateRouting, 'Routing from evaluate node should exist').toBeDefined();

    // Verify transition evaluations occurred
    const evaluations = trace.routing.evaluations();
    expect(evaluations.length, 'At least one transition should be evaluated').toBeGreaterThan(0);

    // Verify routing completed with decisions
    const routingCompletions = trace.routing.completions();
    expect(routingCompletions.length).toBeGreaterThanOrEqual(1);

    // Find routing completion after evaluate node
    const afterEvaluate = routingCompletions.find((rc) => {
      const decisions = rc.payload.decisions as Array<{
        type: string;
        params?: { nodeId?: string };
      }>;
      return decisions.some(
        (d) => d.type === 'CREATE_TOKEN' && d.params?.nodeId !== undefined,
      );
    });
    expect(afterEvaluate, 'Routing decision after evaluate should exist').toBeDefined();

    // =========================================================================
    // NEGATIVE ASSERTIONS - Only approve path taken
    // =========================================================================
    // Verify no tokens were created for review or reject nodes
    const allTokens = trace.tokens.creations();

    // We should NOT have review or reject node tokens
    // Note: We can't directly check node refs from tokens, but we can verify
    // the total count matches expected path length
    expect(allTokens.length, 'Exactly 3 tokens: evaluate → approve → finalize').toBe(3);

    // =========================================================================
    // EVENT MANIFEST - Conditional Routing Specific Events
    // =========================================================================
    const expectedEvents: Record<string, number> = {
      // Routing decision events
      'decision.routing.start': 3, // evaluate, approve, finalize
      'decision.routing.complete': 3,
      // At least 3 transition evaluations from evaluate (one per outgoing transition)
      // Plus transitions from approve and finalize
    };

    for (const [eventType, minCount] of Object.entries(expectedEvents)) {
      const actual = trace.byType(eventType).length;
      expect(
        actual,
        `Event '${eventType}': expected at least ${minCount}, got ${actual}`,
      ).toBeGreaterThanOrEqual(minCount);
    }
  });

  it('routes to review when 50 <= score < 80', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 65 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // WORKFLOW STATUS
    // =========================================================================
    expect(result.status).toBe('completed');

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 3, // All 3 tokens have pathId "root" (linear workflow)
        total: 3, // evaluate → review → finalize
      })
      .withStateWrites([
        { path: 'state.score', type: 'number', description: 'Score from evaluate node' },
        { path: 'state.decision', type: 'string', description: 'Decision from review node' },
        { path: 'state.reason', type: 'string', description: 'Reason from review node' },
      ])
      .withOutput({
        score: { type: 'number', value: 65 },
        decision: { type: 'string', value: 'needs_review' },
        reason: { type: 'string', value: 'Score is in review range' },
      })
      .run();

    // =========================================================================
    // PRIORITY TIER VERIFICATION
    // =========================================================================
    // Score 65 is >= 50 but < 80
    // Priority 1 (>= 80) should NOT match
    // Priority 2 (>= 50) SHOULD match
    // Priority 3 (unconditional) should NOT be evaluated (tier 2 matched)

    const allTokens = trace.tokens.creations();
    expect(allTokens.length, 'Exactly 3 tokens: evaluate → review → finalize').toBe(3);
  });

  it('routes to reject when score < 50 (fallback)', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 30 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // WORKFLOW STATUS
    // =========================================================================
    expect(result.status).toBe('completed');

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 3, // Linear workflow: all tokens have pathId "root"
        total: 3, // evaluate → reject → finalize
      })
      .withStateWrites([
        { path: 'state.score', type: 'number', description: 'Score from evaluate node' },
        { path: 'state.decision', type: 'string', description: 'Decision from reject node' },
        { path: 'state.reason', type: 'string', description: 'Reason from reject node' },
      ])
      .withOutput({
        score: { type: 'number', value: 30 },
        decision: { type: 'string', value: 'rejected' },
        reason: { type: 'string', value: 'Score below threshold' },
      })
      .run();

    // =========================================================================
    // FALLBACK VERIFICATION
    // =========================================================================
    // Score 30 is < 50
    // Priority 1 (>= 80) should NOT match
    // Priority 2 (>= 50) should NOT match
    // Priority 3 (unconditional) SHOULD match as fallback

    const allTokens = trace.tokens.creations();
    expect(allTokens.length, 'Exactly 3 tokens: evaluate → reject → finalize').toBe(3);
  });

  it('routes to approve at boundary (score === 80)', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 80 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION - Boundary condition (>= 80 includes 80)
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withOutput({
        score: { type: 'number', value: 80 },
        decision: { type: 'string', value: 'approved' },
        reason: { type: 'string', value: 'Score meets high threshold' },
      })
      .run();
  });

  it('routes to review at boundary (score === 50)', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 50 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION - Boundary condition (>= 50 includes 50)
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withOutput({
        score: { type: 'number', value: 50 },
        decision: { type: 'string', value: 'needs_review' },
        reason: { type: 'string', value: 'Score is in review range' },
      })
      .run();
  });

  it('routes to reject at boundary (score === 49)', async () => {
    const workflowDef = buildConditionalRoutingWorkflow();
    const workflowInput = { score: 49 };

    const { result } = await runTestWorkflow(workflowDef, workflowInput);
    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION - Just below review threshold
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withOutput({
        score: { type: 'number', value: 49 },
        decision: { type: 'string', value: 'rejected' },
        reason: { type: 'string', value: 'Score below threshold' },
      })
      .run();
  });
});