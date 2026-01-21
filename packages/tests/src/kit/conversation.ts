/**
 * Conversation Creation and Execution
 *
 * Functions for creating, configuring, and executing test conversations.
 * Follows the same patterns as the workflow test kit.
 */

import {
  action,
  ConversationConnection,
  node,
  schema as s,
  step,
  task,
  workflow,
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

// =============================================================================
// Conversation Execution
// =============================================================================

/**
 * Execute conversation turns via WebSocket.
 *
 * WebSocket is the natural transport for conversations:
 * - Persistent bidirectional connection
 * - Receives all events for all turns
 * - Supports concurrent active turns
 * - Handles async operations that complete later
 *
 * @param conversationId - The conversation to connect to
 * @param messages - Messages to send as turns
 * @param options - Execution options
 */
export async function executeConversation(
  conversationId: string,
  messages: Array<{ role: 'user'; content: string; delayMs?: number }>,
  options?: {
    timeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
    /** Send messages sequentially, waiting for each turn to complete before sending next */
    sequential?: boolean;
  },
): Promise<ExecuteConversationResult> {
  const baseUrl = process.env.RESOURCES_URL ?? 'https://api.wflow.app';
  const apiKey = process.env.API_KEY;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const sequential = options?.sequential ?? false;

  console.log('🔌 Connecting to conversation via WebSocket...');

  const conn = await ConversationConnection.connect(baseUrl, apiKey, conversationId, {
    enableTraceEvents: true,
    onError: (error) => console.error('WebSocket error:', error),
  });

  const traceEvents: TraceEventEntry[] = [];
  let status: ExecuteConversationResult['status'] = 'completed';

  // Collect trace events as they arrive
  conn.onTraceEvent((event) => {
    traceEvents.push(event);
    if (options?.logEvents) {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      console.log(`🔍 ${event.type}`, JSON.stringify(payload, null, 2));
    }

    // Check for failures
    if (event.type === 'operation.turns.failed') {
      status = 'failed';
    }
  });

  try {
    if (sequential) {
      // Send messages sequentially, waiting for each turn to complete
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`📤 Sending message ${i + 1}: "${msg.content.substring(0, 50)}..."`);
        await conn.sendAndWait(msg.content, { timeout });
        console.log(`✅ Turn ${i + 1} completed`);
      }
    } else {
      // Send all messages (with optional delays between them)
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.delayMs && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, msg.delayMs));
        }

        console.log(`📤 Sending message ${i + 1}: "${msg.content.substring(0, 50)}..."`);
        conn.send(msg.content);
      }

      // Wait for all turns to complete
      console.log('⏳ Waiting for all turns to complete...');
      const waitPromise = conn.waitForTurnsCount(messages.length);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          status = 'timeout';
          reject(new Error('Timeout waiting for turns to complete'));
        }, timeout),
      );

      await Promise.race([waitPromise, timeoutPromise]);
    }

    // Get collected data
    const turnIds = conn.getTurnIds();

    // Sort events by sequence for consistent analysis
    traceEvents.sort((a, b) => a.sequence - b.sequence);

    console.log(`✅ All ${turnIds.length} turns completed`);

    return {
      conversationId,
      turnIds,
      status,
      events: [], // WebSocket doesn't separate event streams - all comes via trace
      traceEvents,
      trace: new ConversationTraceEventCollection(traceEvents),
    };
  } catch (error) {
    // Handle timeout - return partial results
    const turnIds = conn.getTurnIds();
    traceEvents.sort((a, b) => a.sequence - b.sequence);

    if (error instanceof Error && error.message.includes('Timeout')) {
      return {
        conversationId,
        turnIds,
        status: 'timeout',
        events: [],
        traceEvents,
        trace: new ConversationTraceEventCollection(traceEvents),
      };
    }
    throw error;
  } finally {
    conn.close();
  }
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
  /** Override context assembly workflow def ID (uses passthrough by default) */
  contextAssemblyWorkflowDefId?: string;
  /** Override memory extraction workflow def ID (uses passthrough by default) */
  memoryExtractionWorkflowDefId?: string;
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
    /** Log events to console as they arrive */
    logEvents?: boolean;
    /** Send messages sequentially, waiting for each turn to complete before sending next */
    sequential?: boolean;
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
  let contextAssemblyWorkflowDefId = personaConfig.contextAssemblyWorkflowDefId;
  let memoryExtractionWorkflowDefId = personaConfig.memoryExtractionWorkflowDefId;

  if (!contextAssemblyWorkflowDefId) {
    console.log('📦 Creating context assembly passthrough workflow...');
    const systemPrompt = personaConfig.systemPrompt ?? 'You are a helpful assistant.';
    const contextAssemblyDef = buildContextAssemblyPassthroughWorkflow(systemPrompt);
    const contextAssemblySetup = await createWorkflow(ctx, contextAssemblyDef);
    contextAssemblyWorkflowDefId = contextAssemblySetup.workflowDefId;
    createdResources.workflowIds.push(contextAssemblySetup.workflowId);
    // Track the created resources from the workflow
    createdResources.taskIds.push(...contextAssemblySetup.createdResources.taskIds);
  }

  if (!memoryExtractionWorkflowDefId) {
    console.log('📦 Creating memory extraction noop workflow...');
    const memoryExtractionDef = buildMemoryExtractionNoopWorkflow();
    const memoryExtractionSetup = await createWorkflow(ctx, memoryExtractionDef);
    memoryExtractionWorkflowDefId = memoryExtractionSetup.workflowDefId;
    createdResources.workflowIds.push(memoryExtractionSetup.workflowId);
    // Track the created resources from the workflow
    createdResources.taskIds.push(...memoryExtractionSetup.createdResources.taskIds);
  }

  // Create persona
  console.log('👤 Creating persona...');
  // Note: SDK types use old field names until deployed and regenerated
  const personaResponse = await wonder.personas.create({
    name: personaConfig.name,
    description: `Test persona: ${personaConfig.name}`,
    systemPrompt: personaConfig.systemPrompt ?? 'You are a helpful assistant.',
    modelProfileId: ctx.modelProfileId,
    contextAssemblyWorkflowDefId,
    memoryExtractionWorkflowDefId,
    toolIds: [],
    recentTurnsLimit: 10,
  } as unknown as Parameters<typeof wonder.personas.create>[0]);
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
    name: personaConfig.name ?? 'Test Agent',
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
  const result = await executeConversation(conversationId, messages, options);

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

