import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, createWorkflow, setupTestContext, verify } from '~/kit';

/**
 * Foundation Test 13: Basic Sub-Workflow Invocation
 *
 * Tests the most basic sub-workflow pattern: a parent workflow that invokes
 * a child workflow and waits for its completion.
 *
 * Workflow structure:
 *   Parent: [invoke_child] → (complete)
 *   Child:  [generate] → (complete)
 *
 * Data flow:
 *   1. Parent receives input.message
 *   2. Parent invokes child workflow via subworkflowId on node, passing input.message
 *   3. Child generates a code using the message
 *   4. Child completes, returns { code: ... }
 *   5. Parent resumes with child's output
 *   6. Parent outputs the received code
 *
 * This proves:
 * 1. Subworkflow node dispatches to child coordinator
 * 2. Parent token enters waiting_for_subworkflow state
 * 3. Child workflow executes independently
 * 4. Child completion triggers parent resumption
 * 5. Child output flows back to parent context
 * 6. Parent completes with child-derived output
 */

describe('Foundation: 13 - Basic Sub-Workflow', () => {
  it('executes parent-child workflow with correct data flow', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================

    // Child workflow schemas
    const childInputSchema = s.object({
      message: s.string(),
    });

    const childOutputSchema = s.object({
      code: s.string(),
    });

    // Parent workflow schemas
    const parentInputSchema = s.object({
      message: s.string(),
    });

    const parentOutputSchema = s.object({
      childCode: s.string(),
    });

    // =========================================================================
    // Child Workflow Definition
    // =========================================================================

    const generateAction = action({
      name: 'Generate Code',
      description: 'Generates a random code',
      kind: 'mock',
      implementation: {
        schema: childOutputSchema,
        options: { stringMode: 'words' },
      },
    });

    const generateStep = step({
      ref: 'generate_step',
      ordinal: 0,
      action: generateAction,
      inputMapping: {},
      outputMapping: { 'output.code': 'result.code' },
    });

    const generateTask = task({
      name: 'Generate Task',
      description: 'Generates a random code',
      inputSchema: childInputSchema,
      outputSchema: childOutputSchema,
      steps: [generateStep],
    });

    const generateNode = node({
      ref: 'generate',
      name: 'Generate',
      task: generateTask,
      taskVersion: 1,
      inputMapping: { message: 'input.message' },
      outputMapping: { 'output.code': 'result.code' },
    });

    const childWorkflowDef = workflow({
      name: 'Child Workflow - Code Generator',
      description: 'Simple child workflow that generates a code',
      inputSchema: childInputSchema,
      outputSchema: childOutputSchema,
      outputMapping: { code: 'output.code' },
      initialNodeRef: 'generate',
      nodes: [generateNode],
      transitions: [],
    });

    // =========================================================================
    // Setup: Create child workflow first so parent can reference it
    // =========================================================================

    console.log('🔧 Setting up test context...');
    const ctx = await setupTestContext();

    console.log('📦 Creating child workflow...');
    const childSetup = await createWorkflow(ctx, childWorkflowDef, {
      name: 'Child Workflow for Subworkflow Test',
    });

    // =========================================================================
    // Parent Workflow Definition
    // =========================================================================

    // The parent uses a subworkflow node to invoke the child
    // No task/action needed - the coordinator dispatches directly to child coordinator
    const invokeNode = node({
      ref: 'invoke_child',
      name: 'Invoke Child',
      subworkflowId: childSetup.workflowDefId,
      subworkflowVersion: 1,
      inputMapping: { message: 'input.message' },
      outputMapping: { 'output.childCode': 'result.code' },
    });

    const parentWorkflowDef = workflow({
      name: 'Parent Workflow - Subworkflow Test',
      description: 'Parent workflow that invokes a child workflow',
      inputSchema: parentInputSchema,
      outputSchema: parentOutputSchema,
      outputMapping: { childCode: 'output.childCode' },
      initialNodeRef: 'invoke_child',
      nodes: [invokeNode],
      transitions: [],
    });

    // =========================================================================
    // Execute Parent Workflow
    // =========================================================================

    const workflowInput = { message: 'Hello from parent' };

    console.log('📦 Creating parent workflow...');
    const parentSetup = await createWorkflow(ctx, parentWorkflowDef, {
      name: 'Parent Workflow for Subworkflow Test',
    });

    console.log('🚀 Executing parent workflow...');
    const { executeWorkflow } = await import('~/kit/workflow');
    const result = await executeWorkflow(parentSetup.workflowId, workflowInput, {
      timeout: 60000,
      idleTimeout: 30000,
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
    // Note: With subworkflows, we see tokens from both parent and child workflows
    // since they share the same rootRunId for unified event streaming.
    // Parent: 1 root token, Child: 1 root token = 2 total
    verify(trace, { input: workflowInput, definition: parentWorkflowDef })
      .completed()
      .withTokens({
        root: 2, // Parent root + child root
        total: 2,
      })
      .withOutput({
        childCode: { type: 'string', defined: true },
      })
      .run();

    // =========================================================================
    // SUB-WORKFLOW SPECIFIC ASSERTIONS
    // =========================================================================

    // Verify we have 2 token creations (parent + child)
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations).toHaveLength(2);

    const rootTokenId = tokenCreations[0].payload.tokenId!;
    const statuses = trace.tokens.statusTransitions(rootTokenId);

    // Token should have: pending → dispatched → waiting_for_subworkflow → completed
    expect(statuses).toContain('waiting_for_subworkflow');
    expect(statuses[statuses.length - 1]).toBe('completed');

    // Verify the output contains a code from the child
    const completionEvent = trace.completion.complete();
    expect(completionEvent).toBeDefined();

    const finalOutput = completionEvent!.payload.finalOutput as { childCode: string };
    expect(typeof finalOutput.childCode).toBe('string');
    expect(finalOutput.childCode.length).toBeGreaterThan(0);

    console.log('✅ Sub-workflow test passed!');
    console.log(`   Parent received child code: "${finalOutput.childCode}"`);
  });
});
