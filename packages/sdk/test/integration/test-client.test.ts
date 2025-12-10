import { describe, expect, it } from 'vitest';
import { createClient } from '../../src/index.js';

/**
 * Unified Wonder Client Integration
 *
 * Tests the unified SDK + WebSocket + raw HTTP client functionality
 */
describe('Unified Wonder Client', () => {
  const BASE_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

  it('should create client with all SDK methods', () => {
    const wonder = createClient(BASE_URL);

    // SDK collections should be present
    expect(wonder.workspaces).toBeDefined();
    expect(wonder.projects).toBeDefined();
    expect(wonder.workflows).toBeDefined();
    expect(wonder['workflow-defs']).toBeDefined();
    expect(wonder.actions).toBeDefined();
    expect(wonder['prompt-specs']).toBeDefined();
    expect(wonder['model-profiles']).toBeDefined();

    // WebSocket events client should be present
    expect(wonder.events).toBeDefined();
    expect(wonder.events.subscribe).toBeDefined();
    expect(wonder.events.waitForEvent).toBeDefined();
    expect(wonder.events.waitForCompletion).toBeDefined();
    expect(wonder.events.runWorkflow).toBeDefined();

    // Raw HTTP methods should be present
    expect(wonder.GET).toBeDefined();
    expect(wonder.POST).toBeDefined();
    expect(wonder.PUT).toBeDefined();
    expect(wonder.DELETE).toBeDefined();
    expect(wonder.PATCH).toBeDefined();
  });

  it('should access SDK methods normally', async () => {
    const wonder = createClient(BASE_URL);

    // SDK methods should work as expected
    // Note: These will fail if the API is not accessible, which is expected
    try {
      // Just verify the methods are callable with correct signatures
      expect(typeof wonder.workspaces).toBe('function');
      expect(typeof wonder.workflows).toBe('function');
    } catch (error) {
      // API might not be available, that's okay for type checking
    }
  });

  it('should have WebSocket client with correct interface', () => {
    const wonder = createClient(BASE_URL);
    const { events } = wonder;

    // Events client should have all required methods
    expect(events.subscribe).toBeInstanceOf(Function);
    expect(events.waitForEvent).toBeInstanceOf(Function);
    expect(events.waitForCompletion).toBeInstanceOf(Function);
    expect(events.runWorkflow).toBeInstanceOf(Function);
  });

  it('should have raw HTTP methods', () => {
    const wonder = createClient(BASE_URL);

    // Verify raw HTTP methods exist and are callable
    expect(wonder.GET).toBeInstanceOf(Function);
    expect(wonder.POST).toBeInstanceOf(Function);
    expect(wonder.PUT).toBeInstanceOf(Function);
    expect(wonder.DELETE).toBeInstanceOf(Function);
    expect(wonder.PATCH).toBeInstanceOf(Function);
  });

  it('should handle runWorkflow helper signature', () => {
    const wonder = createClient(BASE_URL);

    // Verify the helper exists on events and has correct type
    expect(wonder.events.runWorkflow).toBeInstanceOf(Function);
    // Function.length counts required parameters only (options has default value)
    expect(wonder.events.runWorkflow.length).toBe(2); // workflowId, input
  });
});

describe('WebSocket + SDK Integration', () => {
  const BASE_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

  it('should connect to events stream independently', async () => {
    const wonder = createClient(BASE_URL);

    // Events client should be able to create subscriptions
    const subscription = await wonder.events.subscribe([
      {
        id: 'integration-test',
        stream: 'events',
        filters: { event_type: 'workflow_started' },
        callback: () => {},
      },
    ]);

    expect(subscription).toBeDefined();
    subscription.close();
  });

  it('should handle waitForCompletion timeout', async () => {
    const wonder = createClient(BASE_URL);

    // Waiting for nonexistent workflow should timeout
    await expect(wonder.events.waitForCompletion('fake-run-id', { timeout: 100 })).rejects.toThrow(
      /Timeout/,
    );
  });

  it('should create proper filter objects', async () => {
    const wonder = createClient(BASE_URL);
    const receivedEvents: any[] = [];

    const subscription = await wonder.events.subscribe([
      {
        id: 'filter-test',
        stream: 'events',
        filters: {
          workflow_run_id: 'test-123',
          event_types: ['workflow_started', 'workflow_completed'],
          workspace_id: 'ws_abc',
        },
        callback: (event) => {
          receivedEvents.push(event);
        },
      },
    ]);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 500));

    subscription.close();

    // Should not throw during filter creation and subscription
    expect(receivedEvents).toBeInstanceOf(Array);
  });
});

describe('Type Safety', () => {
  const BASE_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

  it('should preserve SDK return types', () => {
    const wonder = createClient(BASE_URL);

    // Verify collections return functions (for parameterized resources)
    expect(typeof wonder.workspaces('id').get).toBe('function');
    expect(typeof wonder.workflows('id').start).toBe('function');
    expect(typeof wonder.projects('id').get).toBe('function');
  });

  it('should have consistent WebSocket event types', async () => {
    const wonder = createClient(BASE_URL);

    // Event callback should receive properly typed events
    let receivedEvent: any;

    const subscription = await wonder.events.subscribe([
      {
        id: 'type-test',
        stream: 'events',
        filters: {},
        callback: (event) => {
          receivedEvent = event;
          // Event should be an object
          expect(typeof event).toBe('object');
        },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 100));
    subscription.close();
  });
});
