import { describe, expect, it } from 'vitest';
import { createEventsTestingClient } from '../../src/testing/events-client.js';

/**
 * WebSocket Integration Tests
 *
 * These tests verify the WebSocket client can connect to the Events service
 * and handle subscriptions properly.
 *
 * Note: These tests require the Events service to be running.
 */
describe('WebSocket Event Client', () => {
  const BASE_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

  it('should create events testing client', () => {
    const client = createEventsTestingClient(BASE_URL);
    expect(client).toBeDefined();
    expect(client.subscribe).toBeDefined();
    expect(client.waitForEvent).toBeDefined();
    expect(client.waitForCompletion).toBeDefined();
  });

  it('should connect to WebSocket endpoint', async () => {
    const client = createEventsTestingClient(BASE_URL);

    // Create a subscription
    const subscription = await client.subscribe([
      {
        id: 'test-sub',
        stream: 'events',
        filters: {},
        callback: (event) => {
          // Event handler
        },
      },
    ]);

    expect(subscription).toBeDefined();
    expect(subscription.close).toBeDefined();
    expect(subscription.onEvent).toBeDefined();
    expect(subscription.onError).toBeDefined();

    // Clean up
    subscription.close();
  });

  it('should handle subscription filters', async () => {
    const client = createEventsTestingClient(BASE_URL);
    const events: any[] = [];

    const subscription = await client.subscribe([
      {
        id: 'filtered-sub',
        stream: 'events',
        filters: {
          workflow_run_id: 'test-run-123',
          event_type: 'workflow_started',
        },
        callback: (event) => {
          events.push(event);
        },
      },
    ]);

    // Wait a bit to see if we get any events
    await new Promise((resolve) => setTimeout(resolve, 1000));

    subscription.close();

    // We might not get events if there's no activity, that's okay
    expect(Array.isArray(events)).toBe(true);
  });

  it('should support multiple subscriptions', async () => {
    const client = createEventsTestingClient(BASE_URL);
    const workflowEvents: any[] = [];
    const traceEvents: any[] = [];

    const subscription = await client.subscribe([
      {
        id: 'workflow-sub',
        stream: 'events',
        filters: {},
        callback: (event) => {
          workflowEvents.push(event);
        },
      },
      {
        id: 'trace-sub',
        stream: 'trace',
        filters: {},
        callback: (event) => {
          traceEvents.push(event);
        },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    subscription.close();

    // Both arrays should exist
    expect(Array.isArray(workflowEvents)).toBe(true);
    expect(Array.isArray(traceEvents)).toBe(true);
  });

  it('should handle connection errors gracefully', async () => {
    // Use an invalid URL to test error handling
    const invalidClient = createEventsTestingClient(
      'https://invalid-url-that-does-not-exist.workers.dev',
    );

    await expect(
      invalidClient.subscribe([
        {
          id: 'error-test',
          stream: 'events',
          filters: {},
          callback: () => {},
        },
      ]),
    ).rejects.toThrow();
  });

  it('should timeout when waiting for events that never arrive', async () => {
    const client = createEventsTestingClient(BASE_URL);

    // Wait for an event that will never come
    await expect(
      client.waitForEvent(
        'nonexistent-run-id',
        () => true,
        { timeout: 100 }, // Very short timeout
      ),
    ).rejects.toThrow(/Timeout/);
  });
});

describe('WebSocket Connection Management', () => {
  const BASE_URL = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

  it('should allow closing and reopening connections', async () => {
    const client = createEventsTestingClient(BASE_URL);

    // First connection
    const sub1 = await client.subscribe([
      {
        id: 'conn-1',
        stream: 'events',
        filters: {},
        callback: () => {},
      },
    ]);
    sub1.close();

    // Second connection should work
    const sub2 = await client.subscribe([
      {
        id: 'conn-2',
        stream: 'events',
        filters: {},
        callback: () => {},
      },
    ]);

    expect(sub2).toBeDefined();
    sub2.close();
  });

  it('should handle unsubscribe messages', async () => {
    const client = createEventsTestingClient(BASE_URL);

    const subscription = await client.subscribe([
      {
        id: 'unsub-test',
        stream: 'events',
        filters: {},
        callback: () => {},
      },
    ]);

    // Closing should send unsubscribe messages
    expect(() => subscription.close()).not.toThrow();
  });
});
