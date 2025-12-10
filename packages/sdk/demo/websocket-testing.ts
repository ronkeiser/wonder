/**
 * Example: End-to-End Workflow Testing with WebSocket Events
 *
 * This example demonstrates how to use the unified Wonder client to:
 * 1. Start a workflow
 * 2. Monitor events in real-time via WebSocket
 * 3. Wait for completion
 * 4. Validate execution results
 * 5. Use raw HTTP methods for custom requests
 */

import { createClient } from '@wonder/sdk';

async function main() {
  const wonder = createClient('https://wonder-http.ron-keiser.workers.dev');

  console.log('🚀 Starting workflow execution example...\n');

  // Example 1: Using stream() helper
  console.log('📦 Example 1: Using stream() helper');
  try {
    const result = await wonder.workflows.stream(
      'workflow_abc123',
      { topic: 'AI workflows', count: 5 },
      { timeout: 60000 },
    );

    console.log('✅ Workflow completed!');
    console.log(`   Run ID: ${result.workflow_run_id}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Events: ${result.events.length}`);
    console.log(`   Trace Events: ${result.traceEvents.length}`);
  } catch (error) {
    console.log('❌ Workflow failed:', (error as Error).message);
  }

  console.log('\n---\n');

  // Example 2: Manual event monitoring
  console.log('📡 Example 2: Manual event monitoring with WebSocket');

  // Subscribe to events manually using low-level API
  const events: any[] = [];

  // Start workflow and get run ID (for manual subscription example)
  const startResponse = await wonder.workflows('workflow_abc123').start({
    topic: 'WebSocket example',
    count: 3,
  });

  if (!startResponse?.workflow_run_id) {
    console.log('❌ Failed to start workflow');
    return;
  }

  const runId = startResponse.workflow_run_id;
  console.log(`🎬 Started workflow: ${runId}`);

  const subscription = await wonder.events.subscribe([
    {
      id: 'monitor-workflow',
      stream: 'events',
      filters: {
        workflow_run_id: runId,
      },
      callback: (event) => {
        events.push(event);
        console.log(`   📨 Event: ${event.event_type}`);

        // Log specific event types
        if (event.event_type === 'node_started') {
          console.log(`      → Node started: ${event.node_id}`);
        } else if (event.event_type === 'node_completed') {
          console.log(`      ✓ Node completed: ${event.node_id}`);
        } else if (
          event.event_type === 'workflow_completed' ||
          event.event_type === 'workflow_failed'
        ) {
          console.log(`\n✅ Workflow ${event.status}!`);
          console.log(`   Total events received: ${events.length}`);
          subscription.close();
        }
      },
    },
    {
      id: 'monitor-trace',
      stream: 'trace',
      filters: {
        workflow_run_id: runId,
        category: 'decision',
      },
      callback: (event) => {
        console.log(`   🔍 Trace: ${event.type} (${event.duration_ms}ms)`);
      },
    },
  ]);

  // Note: In this manual example, we let the callbacks handle everything.
  // The subscription will be closed when workflow_completed/failed event arrives.
  // For automatic handling, use workflows.stream() instead (see Examples 1, 3, 5).

  console.log('\n---\n');

  // Example 3: Wait for specific event with until predicate
  console.log('⏳ Example 3: Wait for specific event');

  try {
    const result = await wonder.workflows.stream(
      'workflow_xyz789',
      { data: 'test' },
      {
        until: (event: any) =>
          event.event_type === 'node_completed' && event.node_id === 'process_data',
        timeout: 30000,
      },
    );

    const nodeEvent = result.events.find(
      (e: any) => e.event_type === 'node_completed' && e.node_id === 'process_data',
    );

    console.log('✅ Specific node completed!');
    console.log(`   Node: ${nodeEvent?.node_id}`);
    console.log(`   Timestamp: ${new Date(nodeEvent?.timestamp).toISOString()}`);
  } catch (error) {
    console.log('❌ Timeout waiting for specific event');
  }

  console.log('\n---\n');

  // Example 4: Using raw HTTP methods
  console.log('🔧 Example 4: Using raw HTTP methods for custom requests');

  try {
    // Use raw GET for direct HTTP access
    const response = await wonder.GET('/api/workspaces', {});
    console.log(`✅ Raw GET: Found ${response.data?.workspaces?.length || 0} workspaces`);

    // Use raw POST with full control
    const createResponse = await wonder.POST('/api/workspaces', {
      body: { name: 'Test Workspace', description: 'Created via raw HTTP' },
    });
    console.log(`✅ Raw POST: Created workspace ${createResponse.data?.workspace?.id}`);
  } catch (error) {
    console.log('❌ Raw HTTP request failed:', (error as Error).message);
  }

  console.log('\n---\n');

  // Example 5: Parallel workflow monitoring
  console.log('🔀 Example 5: Monitor multiple workflows in parallel');

  const workflows = ['wf_1', 'wf_2', 'wf_3'];
  const promises = workflows.map(async (wfId) => {
    const result = await wonder.workflows.stream(wfId, { test: true }, { timeout: 30000 });
    return { wfId, runId: result.workflow_run_id, status: result.status };
  });

  const results = await Promise.allSettled(promises);
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      console.log(`   ✓ ${workflows[index]}: ${result.value.status}`);
    } else {
      console.log(`   ✗ ${workflows[index]}: failed`);
    }
  });

  console.log('\n🎉 All examples completed!');
}

// Run the examples
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
