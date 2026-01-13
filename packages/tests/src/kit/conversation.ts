/**
 * Conversation Creation and Execution
 *
 * Functions for creating, configuring, and executing test conversations.
 * Follows the same patterns as the workflow test kit.
 */

import {
  action,
  node,
  schema as s,
  step,
  task,
  workflow,
  type EventEntry,
  type TraceEventEntry,
} from '@wonder/sdk';
import { ConversationTraceEventCollection } from './conversation-trace';
import { wonder } from '~/client';
import { setupTestContext } from './context';
import { createWorkflow } from './workflow';
import type {
  ConversationTestSetup,
  CreatedConversationResources,
  ExecuteConversationResult,
  TestConversationResult,
} from './types';

export type {
  ConversationTestSetup,
  ExecuteConversationResult,
  TestConversationResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 30000; // 30 seconds

// =============================================================================
// Conversation Execution
// =============================================================================

/**
 * Executes conversation turns using SSE streaming.
 *
 * Sends each message as a turn, collects trace events, and returns
 * the aggregated results.
 */
export async function executeConversation(
  conversationId: string,
  messages: Array<{ role: 'user'; content: string }>,
  options?: {
    timeout?: number;
    idleTimeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
    /** Enable trace event emission for this conversation */
    enableTraceEvents?: boolean;
  },
): Promise<ExecuteConversationResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS;

  const events: EventEntry[] = [];
  const traceEvents: TraceEventEntry[] = [];
  const turnIds: string[] = [];
  let status: ExecuteConversationResult['status'] = 'completed';

  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout) {
      idleTimer = setTimeout(() => {
        status = 'idle_timeout';
        timedOut = true;
      }, idleTimeout);
    }
  };

  // Set up total timeout
  if (timeout) {
    totalTimer = setTimeout(() => {
      status = 'timeout';
      timedOut = true;
    }, timeout);
  }

  try {
    for (const message of messages) {
      if (timedOut) break;

      resetIdleTimer();

      // Start turn via SDK (returns SSE stream)
      const stream = wonder.conversations(conversationId).turns({
        stream: true,
        content: message.content,
        enableTraceEvents: options?.enableTraceEvents ?? true,
      });

      for await (const sseEvent of stream) {
        if (timedOut) break;

        resetIdleTimer();

        if (sseEvent.stream === 'trace') {
          const traceEvent = sseEvent.event as TraceEventEntry;
          traceEvents.push(traceEvent);

          if (options?.logEvents) {
            console.log(`🔍 ${traceEvent.type}`, JSON.stringify(traceEvent.payload ?? {}, null, 2));
          }

          // Extract turnId from turn.created event
          if (traceEvent.type === 'operation.turns.created') {
            const payload = traceEvent.payload as { turnId?: string };
            if (payload.turnId) {
              turnIds.push(payload.turnId);
            }
          }

          // Check for terminal conditions in trace events
          // Conversations emit trace events, not regular events for turn lifecycle
          if (traceEvent.type === 'operation.turns.completed') {
            // Turn done, continue to next message
            break;
          }
          if (traceEvent.type === 'operation.turns.failed') {
            status = 'failed';
            break;
          }
        } else {
          const event = sseEvent.event as EventEntry;
          events.push(event);

          if (options?.logEvents) {
            console.log(`📨 ${event.eventType}`, event.metadata);
          }

          // Check for terminal conditions in regular events (fallback)
          if (event.eventType === 'turn.completed') {
            // Turn done, continue to next message
            break;
          }
          if (event.eventType === 'turn.failed') {
            status = 'failed';
            break;
          }
        }
      }

      if (status === 'failed') break;
    }
  } finally {
    if (totalTimer) clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }

  return {
    conversationId,
    turnIds,
    status,
    events,
    traceEvents,
    trace: new ConversationTraceEventCollection(traceEvents),
  };
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Clean up conversation test resources.
 */
export async function cleanupConversationTest(
  setup: ConversationTestSetup,
): Promise<number> {
  let deleted = 0;

  // Delete in reverse order of creation (LIFO)
  const { createdResources } = setup;

  // Delete conversation
  try {
    await wonder.conversations(setup.conversationId).delete();
    deleted++;
  } catch {
    // Ignore - may have been deleted already
  }

  // Delete agent
  if (createdResources.agentId) {
    try {
      await wonder.agents(createdResources.agentId).delete();
      deleted++;
    } catch {
      // Ignore
    }
  }

  // Delete persona
  if (createdResources.personaId) {
    try {
      await wonder.personas(createdResources.personaId).delete();
      deleted++;
    } catch {
      // Ignore
    }
  }

  // Delete tools
  for (const toolId of [...createdResources.toolIds].reverse()) {
    try {
      await wonder.tools(toolId).delete();
      deleted++;
    } catch {
      // Ignore
    }
  }

  // Delete tasks
  for (const taskId of [...createdResources.taskIds].reverse()) {
    try {
      await wonder.tasks(taskId).delete();
      deleted++;
    } catch {
      // Ignore
    }
  }

  // Delete workflows
  for (const workflowId of [...createdResources.workflowIds].reverse()) {
    try {
      await wonder.workflows(workflowId).delete();
      deleted++;
    } catch {
      // Ignore
    }
  }

  // Delete model profile
  try {
    await wonder.modelProfiles(setup.modelProfileId).delete();
    deleted++;
  } catch {
    // Ignore
  }

  // Delete project
  try {
    await wonder.projects(setup.projectId).delete();
    deleted++;
  } catch {
    // Ignore
  }

  // Delete workspace
  try {
    await wonder.workspaces(setup.workspaceId).delete();
    deleted++;
  } catch {
    // Ignore
  }

  return deleted;
}

// =============================================================================
// Test Personas
// =============================================================================

/**
 * Minimal test persona configuration.
 *
 * For E2E tests, we need a persona with:
 * - A model profile
 * - Optional tools
 * - Context assembly workflow (passthrough for tests)
 * - Memory extraction workflow (passthrough for tests)
 */
export interface TestPersonaConfig {
  name: string;
  systemPrompt?: string;
  /** Tool configurations - will be created and linked */
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    targetType: 'task' | 'workflow' | 'agent';
    targetId: string;
    async?: boolean;
  }>;
  /** Override context assembly workflow ID (uses passthrough by default) */
  contextAssemblyWorkflowId?: string;
  /** Override memory extraction workflow ID (uses passthrough by default) */
  memoryExtractionWorkflowId?: string;
}

// =============================================================================
// Passthrough Workflows for Tests
// =============================================================================

/**
 * Creates a passthrough context assembly workflow.
 *
 * Context assembly receives ContextAssemblyInput and outputs { llmRequest: LLMRequest }.
 * This passthrough version builds a minimal LLMRequest with just the user message.
 */
function buildContextAssemblyPassthroughWorkflow(systemPrompt: string) {
  // Context assembly output must be { llmRequest: { messages: [...], systemPrompt: '...' } }
  const contextAction = action({
    name: 'Build LLM Request',
    description: 'Builds minimal LLM request from user message',
    kind: 'context',
    implementation: {},
  });

  const buildRequestStep = step({
    ref: 'build_request',
    ordinal: 0,
    action: contextAction,
    inputMapping: {
      userMessage: 'input.userMessage',
    },
    // Build the nested llmRequest structure
    // Expression syntax uses unquoted keys like JS, and single quotes for string literals
    outputMapping: {
      'output.llmRequest': `{ messages: [{ role: 'user', content: result.userMessage }], systemPrompt: '${systemPrompt.replace(/'/g, "\\'")}' }`,
    },
  });

  // Define the LLM request message schema
  const messageSchema = s.object({
    role: s.string(),
    content: s.string(),
  });

  // Define the LLM request schema
  const llmRequestSchema = s.object({
    messages: s.array(messageSchema),
    systemPrompt: s.string(),
  });

  const buildRequestTask = task({
    name: 'Context Assembly Passthrough',
    description: 'Builds LLM request from user message',
    inputSchema: s.object({
      userMessage: s.string(),
    }),
    outputSchema: s.object({
      llmRequest: llmRequestSchema,
    }),
    steps: [buildRequestStep],
  });

  const buildRequestNode = node({
    ref: 'build_request',
    name: 'Build Request',
    task: buildRequestTask,
    taskVersion: 1,
    inputMapping: {
      userMessage: 'input.userMessage',
    },
    outputMapping: {
      'output.llmRequest': 'result.llmRequest',
    },
  });

  return workflow({
    name: 'Context Assembly Passthrough',
    description: 'Test passthrough for context assembly',
    inputSchema: s.object({
      conversationId: s.string(),
      userMessage: s.string(),
      recentTurns: s.array(s.object({})),
      modelProfileId: s.string(),
      toolIds: s.array(s.string()),
      toolDefinitions: s.array(s.object({})),
    }),
    outputSchema: s.object({
      llmRequest: llmRequestSchema,
    }),
    outputMapping: {
      llmRequest: 'output.llmRequest',
    },
    initialNodeRef: 'build_request',
    nodes: [buildRequestNode],
    transitions: [],
  });
}

/**
 * Creates a noop memory extraction workflow.
 *
 * Memory extraction receives MemoryExtractionInput and has side effects only.
 * This noop version does nothing - just passes through.
 */
function buildMemoryExtractionNoopWorkflow() {
  const noopAction = action({
    name: 'Noop',
    description: 'Does nothing',
    kind: 'context',
    implementation: {},
  });

  const noopStep = step({
    ref: 'noop',
    ordinal: 0,
    action: noopAction,
    inputMapping: {},
    outputMapping: {},
  });

  const noopTask = task({
    name: 'Memory Extraction Noop',
    description: 'Does nothing',
    inputSchema: s.object({}),
    outputSchema: s.object({}),
    steps: [noopStep],
  });

  const noopNode = node({
    ref: 'noop',
    name: 'Noop',
    task: noopTask,
    taskVersion: 1,
    inputMapping: {},
    outputMapping: {},
  });

  return workflow({
    name: 'Memory Extraction Noop',
    description: 'Test noop for memory extraction',
    inputSchema: s.object({
      agentId: s.string(),
      turnId: s.string(),
      transcript: s.array(s.object({})),
    }),
    outputSchema: s.object({}),
    outputMapping: {},
    initialNodeRef: 'noop',
    nodes: [noopNode],
    transitions: [],
  });
}

// =============================================================================
// Main Test Helper
// =============================================================================

/**
 * All-in-one helper to scaffold, run, and cleanup a test conversation.
 *
 * This is the simplest way to test a conversation:
 * 1. Creates workspace, project, model profile
 * 2. Creates agent with persona and tools
 * 3. Creates conversation
 * 4. Executes turns via SSE streaming
 * 5. Returns results and a cleanup function
 *
 * @example
 * const { result, cleanup } = await runTestConversation(
 *   {
 *     name: 'Test Persona',
 *     systemPrompt: 'You are a helpful assistant.',
 *   },
 *   [{ role: 'user', content: 'Hello!' }],
 * );
 *
 * assertConversationInvariants(result.trace);
 * expect(result.status).toBe('completed');
 * await cleanup();
 */
export async function runTestConversation(
  personaConfig: TestPersonaConfig,
  messages: Array<{ role: 'user'; content: string }>,
  options?: {
    timeout?: number;
    idleTimeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
    /** Enable trace event emission for this conversation */
    enableTraceEvents?: boolean;
  },
): Promise<TestConversationResult> {
  // Setup infrastructure
  console.log('🔧 Setting up test project...');
  const ctx = await setupTestContext();

  const createdResources: CreatedConversationResources = {
    toolIds: [],
    taskIds: [],
    workflowIds: [],
  };

  // Create passthrough workflows if not provided
  let contextAssemblyWorkflowId = personaConfig.contextAssemblyWorkflowId;
  let memoryExtractionWorkflowId = personaConfig.memoryExtractionWorkflowId;

  if (!contextAssemblyWorkflowId) {
    console.log('📦 Creating context assembly passthrough workflow...');
    const systemPrompt = personaConfig.systemPrompt ?? 'You are a helpful assistant.';
    const contextAssemblyDef = buildContextAssemblyPassthroughWorkflow(systemPrompt);
    const contextAssemblySetup = await createWorkflow(ctx, contextAssemblyDef);
    contextAssemblyWorkflowId = contextAssemblySetup.workflowId;
    createdResources.workflowIds.push(contextAssemblyWorkflowId);
    // Track the created resources from the workflow
    createdResources.taskIds.push(...contextAssemblySetup.createdResources.taskIds);
  }

  if (!memoryExtractionWorkflowId) {
    console.log('📦 Creating memory extraction noop workflow...');
    const memoryExtractionDef = buildMemoryExtractionNoopWorkflow();
    const memoryExtractionSetup = await createWorkflow(ctx, memoryExtractionDef);
    memoryExtractionWorkflowId = memoryExtractionSetup.workflowId;
    createdResources.workflowIds.push(memoryExtractionWorkflowId);
    // Track the created resources from the workflow
    createdResources.taskIds.push(...memoryExtractionSetup.createdResources.taskIds);
  }

  // Create persona
  console.log('👤 Creating persona...');
  const personaResponse = await wonder.personas.create({
    name: personaConfig.name,
    description: `Test persona: ${personaConfig.name}`,
    systemPrompt: personaConfig.systemPrompt ?? 'You are a helpful assistant.',
    modelProfileId: ctx.modelProfileId,
    contextAssemblyWorkflowId,
    memoryExtractionWorkflowId,
    toolIds: [],
    recentTurnsLimit: 10,
  });
  const personaId = personaResponse.personaId;
  createdResources.personaId = personaId;

  // Create tools if specified
  if (personaConfig.tools && personaConfig.tools.length > 0) {
    console.log(`🔧 Creating ${personaConfig.tools.length} tools...`);
    for (const tool of personaConfig.tools) {
      const toolResponse = await wonder.tools.create({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        targetType: tool.targetType,
        targetId: tool.targetId,
        async: tool.async ?? false,
      });
      createdResources.toolIds.push(toolResponse.toolId);
    }
  }

  // Create agent
  console.log('🤖 Creating agent...');
  const agentResponse = await wonder.agents.create({
    projectIds: [ctx.projectId],
    personaId,
  });
  const agentId = agentResponse.agentId;
  createdResources.agentId = agentId;

  // Create conversation
  console.log('💬 Creating conversation...');
  const conversationResponse = await wonder.conversations.create({
    participants: [
      { type: 'user', userId: 'test_user' },
      { type: 'agent', agentId },
    ],
    status: 'active',
  });
  const conversationId = conversationResponse.conversationId;

  // Execute conversation
  console.log('🚀 Starting conversation execution...');
  const result = await executeConversation(conversationId, messages, {
    ...options,
    enableTraceEvents: options?.enableTraceEvents ?? true,
  });

  // Output conversation info for debugging
  const apiKey = process.env.API_KEY ?? '$API_KEY';
  console.log('\n📋 Conversation Info:');
  console.log(`   conversationId: ${conversationId}`);
  console.log(`   turnIds: ${result.turnIds.join(', ')}`);
  console.log(`   status: ${result.status}`);
  console.log('\n🔍 Debug Query Examples:');
  console.log('   # Events:');
  console.log(
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events?streamId=${conversationId}"`,
  );
  console.log('   # Trace events:');
  console.log(
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events/trace?streamId=${conversationId}"`,
  );
  console.log('');

  const setup: ConversationTestSetup = {
    ...ctx,
    agentId,
    personaId,
    conversationId,
    createdResources,
  };

  return {
    result,
    setup,
    cleanup: async () => {
      console.log('🧹 Starting cleanup...');
      const count = await cleanupConversationTest(setup);
      console.log(`✨ Cleanup complete (${count} resources)`);
    },
  };
}
