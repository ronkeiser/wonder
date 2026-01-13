/**
 * Conversation Creation and Execution
 *
 * Functions for creating, configuring, and executing test conversations.
 * Follows the same patterns as the workflow test kit.
 */

import type { EventEntry, TraceEventEntry } from '@wonder/sdk';
import { ConversationTraceEventCollection } from './conversation-trace';
import { wonder } from '~/client';
import { setupTestContext } from './context';
import type {
  ConversationTestSetup,
  CreatedConversationResources,
  ExecuteConversationResult,
  TestContext,
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
// SSE Parsing (until SDK is regenerated with conversation streaming)
// =============================================================================

interface ConversationSSEEvent {
  stream: 'events' | 'trace';
  event: EventEntry | TraceEventEntry;
}

/**
 * Parse SSE stream into async generator of events
 */
async function* parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (end with \n\n)
      const messages = buffer.split('\n\n');
      buffer = messages.pop() ?? '';

      for (const message of messages) {
        if (!message.trim()) continue;

        // Parse SSE format: "data: {...}"
        for (const line of message.split('\n')) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              yield JSON.parse(jsonStr) as T;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Start a conversation turn with SSE streaming.
 *
 * This is a temporary helper until the SDK is regenerated with
 * the conversation startTurn method.
 */
async function* startTurn(
  conversationId: string,
  body: { stream: true; content: string; enableTraceEvents?: boolean },
): AsyncGenerator<ConversationSSEEvent> {
  const baseUrl = 'https://api.wflow.app';
  const apiKey = process.env.API_KEY;

  const response = await fetch(`${baseUrl}/conversations/${conversationId}/turns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey ?? '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`POST /conversations/${conversationId}/turns failed: ${error}`);
  }

  if (!response.body) {
    throw new Error(`POST /conversations/${conversationId}/turns returned no body`);
  }

  yield* parseSSEStream<ConversationSSEEvent>(response.body);
}

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

      // Start turn via SSE endpoint
      const stream = startTurn(conversationId, {
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
        } else {
          const event = sseEvent.event as EventEntry;
          events.push(event);

          if (options?.logEvents) {
            console.log(`📨 ${event.eventType}`, event.metadata);
          }

          // Check for terminal conditions
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

  // TODO: Create passthrough workflows for context assembly and memory extraction
  // For now, we'll require them to be provided or skip
  if (!personaConfig.contextAssemblyWorkflowId) {
    throw new Error(
      'Context assembly workflow ID is required. Create a passthrough workflow and pass its ID.',
    );
  }
  if (!personaConfig.memoryExtractionWorkflowId) {
    throw new Error(
      'Memory extraction workflow ID is required. Create a passthrough workflow and pass its ID.',
    );
  }

  // Create persona
  console.log('👤 Creating persona...');
  const personaResponse = await wonder.personas.create({
    name: personaConfig.name,
    description: `Test persona: ${personaConfig.name}`,
    systemPrompt: personaConfig.systemPrompt ?? 'You are a helpful assistant.',
    modelProfileId: ctx.modelProfileId,
    contextAssemblyWorkflowId: personaConfig.contextAssemblyWorkflowId,
    memoryExtractionWorkflowId: personaConfig.memoryExtractionWorkflowId,
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
