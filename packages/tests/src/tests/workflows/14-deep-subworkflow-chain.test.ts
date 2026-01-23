import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, createWorkflow, setupTestContext, verify } from '~/kit';

/**
 * Foundation Test 14: Deep Sub-Workflow Chain
 *
 * Tests deeply nested subworkflows to verify that depth resets properly.
 * If Cloudflare's 16-level depth limit were cumulative across subworkflows,
 * this test would fail. The fact that it passes proves depth resets on
 * Executor callbacks.
 *
 * Workflow structure (10 levels deep):
 *   Level 0 (root): [invoke_level_1] → complete
 *   Level 1:        [invoke_level_2] → complete
 *   Level 2:        [invoke_level_3] → complete
 *   ...
 *   Level 9:        [generate] → complete (leaf node with actual task)
 *
 * Each level:
 * 1. Receives depth counter in input
 * 2. Invokes next level (or generates if leaf)
 * 3. Returns result with depth info
 *
 * This proves:
 * 1. Subworkflows can nest arbitrarily deep
 * 2. Executor callbacks reset subrequest depth
 * 3. Same-service Coordinator-to-Coordinator calls work at depth
 */

const DEPTH = 10; // 10 levels of nesting - well beyond the 16-depth limit if it were cumulative

describe('Foundation: 14 - Deep Sub-Workflow Chain', () => {
  it(`executes ${DEPTH}-level deep subworkflow chain`, { timeout: 120000 }, async () => {
    // =========================================================================
    // Schemas (shared across all levels)
    // =========================================================================

    const levelInputSchema = s.object({
      depth: s.number(),
      message: s.string(),
    });

    const levelOutputSchema = s.object({
      maxDepthReached: s.number(),
      result: s.string(),
    });

    // =========================================================================
    // Setup
    // =========================================================================

    console.log('Setting up test context...');
    const ctx = await setupTestContext();

    // =========================================================================
    // Create leaf workflow (Level DEPTH-1) - has actual task
    // =========================================================================

    console.log(`Creating leaf workflow (level ${DEPTH - 1})...`);

    const leafAction = action({
      name: 'Generate Result',
      description: 'Generates the final result at the deepest level',
      kind: 'mock',
      implementation: {
        schema: s.object({ result: s.string() }),
        options: { stringMode: 'words' },
      },
    });

    const leafStep = step({
      ref: 'generate_step',
      ordinal: 0,
      action: leafAction,
      inputMapping: {},
      outputMapping: { 'output.result': 'result.result' },
    });

    const leafTask = task({
      name: 'Generate Result Task',
      description: 'Generates final result',
      inputSchema: levelInputSchema,
      outputSchema: s.object({ result: s.string() }),
      steps: [leafStep],
    });

    const leafNode = node({
      ref: 'generate',
      name: 'Generate',
      task: leafTask,
      taskVersion: 1,
      inputMapping: {
        depth: 'input.depth',
        message: 'input.message',
      },
      outputMapping: {
        'output.result': 'result.result',
        'output.maxDepthReached': 'input.depth',
      },
    });

    const leafWorkflow = workflow({
      name: `Subworkflow Level ${DEPTH - 1} (Leaf)`,
      description: `Leaf workflow at depth ${DEPTH - 1}`,
      inputSchema: levelInputSchema,
      outputSchema: levelOutputSchema,
      outputMapping: {
        maxDepthReached: 'output.maxDepthReached',
        result: 'output.result',
      },
      initialNodeRef: 'generate',
      nodes: [leafNode],
      transitions: [],
    });

    const leafSetup = await createWorkflow(ctx, leafWorkflow, {
      name: `Subworkflow Level ${DEPTH - 1}`,
    });

    // =========================================================================
    // Create intermediate workflows (Level DEPTH-2 down to 1)
    // Each invokes the next level as a subworkflow
    // =========================================================================

    let childWorkflowDefId = leafSetup.workflowDefId;
    const workflowSetups: Array<{ workflowId: string; workflowDefId: string }> = [leafSetup];

    for (let level = DEPTH - 2; level >= 0; level--) {
      console.log(`Creating workflow level ${level}...`);

      const invokeNode = node({
        ref: 'invoke_next',
        name: `Invoke Level ${level + 1}`,
        subworkflowId: childWorkflowDefId,
        subworkflowVersion: 1,
        inputMapping: {
          depth: `input.depth + 1`, // Increment depth counter
          message: 'input.message',
        },
        outputMapping: {
          'output.maxDepthReached': 'result.maxDepthReached',
          'output.result': 'result.result',
        },
      });

      const levelWorkflow = workflow({
        name: `Subworkflow Level ${level}`,
        description: `Intermediate workflow at depth ${level}`,
        inputSchema: levelInputSchema,
        outputSchema: levelOutputSchema,
        outputMapping: {
          maxDepthReached: 'output.maxDepthReached',
          result: 'output.result',
        },
        initialNodeRef: 'invoke_next',
        nodes: [invokeNode],
        transitions: [],
      });

      const setup = await createWorkflow(ctx, levelWorkflow, {
        name: `Subworkflow Level ${level}`,
      });

      workflowSetups.unshift(setup);
      childWorkflowDefId = setup.workflowDefId;
    }

    // =========================================================================
    // Execute root workflow (Level 0)
    // =========================================================================

    const rootSetup = workflowSetups[0];
    const workflowInput = { depth: 0, message: 'Testing deep nesting' };

    console.log(`Executing root workflow with ${DEPTH} levels of nesting...`);
    const { executeWorkflow } = await import('~/kit/workflow');
    const result = await executeWorkflow(rootSetup.workflowId, workflowInput, {
      timeout: 120000,
      idleTimeout: 60000,
      logEvents: true,
    });

    const { trace } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================

    // Each level creates 1 root token = DEPTH total tokens
    verify(trace, { input: workflowInput, definition: workflowSetups[0] as any })
      .completed()
      .withTokens({
        root: DEPTH,
        total: DEPTH,
      })
      .withOutput({
        maxDepthReached: { type: 'number', defined: true },
        result: { type: 'string', defined: true },
      })
      .run();

    // =========================================================================
    // DEPTH-SPECIFIC ASSERTIONS
    // =========================================================================

    // Verify we reached the expected depth
    const completionEvent = trace.completion.complete();
    expect(completionEvent).toBeDefined();

    const finalOutput = completionEvent!.payload.finalOutput as {
      maxDepthReached: number;
      result: string;
    };

    // The leaf is at level DEPTH-1, and we pass depth starting at 0
    // Each level increments, so leaf receives DEPTH-1
    expect(finalOutput.maxDepthReached).toBe(DEPTH - 1);
    expect(typeof finalOutput.result).toBe('string');
    expect(finalOutput.result.length).toBeGreaterThan(0);

    // Verify token count matches expected nesting
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations).toHaveLength(DEPTH);

    // Verify we saw waiting_for_subworkflow states (all but leaf)
    const allStatuses = tokenCreations.map((tc) => {
      const tokenId = tc.payload.tokenId!;
      return trace.tokens.statusTransitions(tokenId);
    });

    // Count how many tokens went through waiting_for_subworkflow
    const waitingCount = allStatuses.filter((statuses) =>
      statuses.includes('waiting_for_subworkflow'),
    ).length;

    // All levels except the leaf should wait for subworkflow
    expect(waitingCount).toBe(DEPTH - 1);

    console.log(`Deep subworkflow chain test passed!`);
    console.log(`   Depth levels: ${DEPTH}`);
    console.log(`   Max depth reached: ${finalOutput.maxDepthReached}`);
    console.log(`   Result: "${finalOutput.result}"`);
    console.log(`   Tokens with waiting_for_subworkflow: ${waitingCount}`);
  });
});
