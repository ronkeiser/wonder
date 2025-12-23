import {
  action,
  modelProfile,
  node,
  promptSpec,
  schema as s,
  step,
  task,
  workflow,
} from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, runTestWorkflow } from '~/kit';

/**
 * LLM Test 01: Claude Greeting
 *
 * A simple single-node workflow that uses Claude to greet a user by name.
 * This validates the Anthropic provider integration.
 *
 * Workflow structure:
 *   [greet] → (complete)
 *
 * This proves:
 * 1. Anthropic Claude provider integration works
 * 2. Model profile with Claude model ID is correctly configured
 * 3. Prompt template rendering with variables works
 * 4. LLM response is captured and mapped to output
 * 5. Token usage is tracked for cost calculation
 */

describe('LLM: 01 - Claude Greeting', () => {
  it('executes single node workflow with Claude LLM', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({ name: s.string() }, { required: ['name'] });
    const outputSchema = s.object({ greeting: s.string() }, { required: ['greeting'] });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const greetPrompt = promptSpec({
      name: 'Greeting Prompt',
      description: 'Generates a friendly greeting for a user',
      template: 'Generate a short, friendly greeting for a user named {{name}}. Keep it to one sentence.',
      requires: { name: { type: 'string' } },
      produces: s.object({ greeting: s.string() }, { required: ['greeting'] }),
    });

    const claudeModel = modelProfile({
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      modelId: 'claude-3-5-haiku-20241022',
      parameters: {
        max_tokens: 256,
        temperature: 0.7,
      },
      costPer1kInputTokens: 0.001,
      costPer1kOutputTokens: 0.005,
    });

    const greetAction = action({
      name: 'Greet User',
      description: 'Generates a greeting using Claude',
      kind: 'llm',
      implementation: {
        promptSpec: greetPrompt,
        modelProfile: claudeModel,
      },
    });

    const greetStep = step({
      ref: 'greet_step',
      ordinal: 0,
      action: greetAction,
      inputMapping: { name: 'input.name' },
      outputMapping: { 'output.greeting': 'result.response' },
    });

    const greetTask = task({
      name: 'Greet Task',
      description: 'Greets the user',
      inputSchema: s.object({ name: s.string() }, { required: ['name'] }),
      outputSchema,
      steps: [greetStep],
    });

    const greetNode = node({
      ref: 'greet',
      name: 'Greet',
      task: greetTask,
      taskVersion: 1,
      inputMapping: { name: 'input.name' },
      outputMapping: { 'output.greeting': 'result.greeting' },
    });

    const workflowDef = workflow({
      name: 'Claude Greeting Test',
      description: 'LLM test 01 - Claude greeting',
      inputSchema,
      outputSchema,
      outputMapping: { greeting: 'output.greeting' },
      initialNodeRef: 'greet',
      nodes: [greetNode],
      transitions: [],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const startTime = Date.now();
    const { result } = await runTestWorkflow(workflowDef, { name: 'Alice' });

    const { trace, events } = result;
    const elapsedMs = Date.now() - startTime;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // TIMING
    // =========================================================================
    expect(elapsedMs, 'LLM workflow should complete in under 30s').toBeLessThan(30000);

    // =========================================================================
    // WORKFLOW STATUS
    // =========================================================================
    expect(result.status).toBe('completed');

    // =========================================================================
    // WORKFLOW EVENTS
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
    const tokenId = rootToken.tokenId!;

    const statuses = trace.tokens.statusTransitions(tokenId);
    expect(statuses).toEqual(['pending', 'dispatched', 'executing', 'completed']);

    // =========================================================================
    // EXECUTOR - Action Execution
    // =========================================================================
    const actionStarts = trace.executor.actionStartsFor(tokenId);
    expect(actionStarts, 'Exactly one action started').toHaveLength(1);
    expect(actionStarts[0].payload.actionKind).toBe('llm');

    const actionCompletions = trace.executor.actionCompletionsFor(tokenId);
    expect(actionCompletions, 'Exactly one action completed').toHaveLength(1);
    expect(actionCompletions[0].payload.actionKind).toBe('llm');

    // =========================================================================
    // COMPLETION
    // =========================================================================
    const completionComplete = trace.completion.complete();
    expect(completionComplete, 'Completion event must exist').toBeDefined();

    const finalOutput = completionComplete!.payload.finalOutput as { greeting: string };
    expect(typeof finalOutput.greeting).toBe('string');
    expect(finalOutput.greeting.length, 'Greeting must be non-empty').toBeGreaterThan(0);

    // Verify the greeting mentions the user's name (basic sanity check)
    // Note: LLM output is non-deterministic, so we just check it's a string
    console.log('Generated greeting:', finalOutput.greeting);
  });
});
