#!/usr/bin/env tsx
/** Test WebSocket event streaming against deployed infrastructure */

// Configure API base (default to production, or pass as first arg)
const API_BASE = process.argv[2] || 'https://wonder-http.ron-keiser.workers.dev';
const WORKFLOW_ID = '01JDXSEED0000WORKFLOW0001'; // Hello World workflow from seed data

async function main() {
  console.log(`📡 API Base: ${API_BASE}\n`);
  console.log('🚀 Starting workflow execution...\n');

  // Start workflow
  const startResponse = await fetch(`${API_BASE}/api/workflows/${WORKFLOW_ID}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'World',
    }),
  });

  if (!startResponse.ok) {
    const error = await startResponse.text();
    console.error('❌ Failed to start workflow:', error);
    process.exit(1);
  }

  const { workflow_run_id, durable_object_id } = (await startResponse.json()) as {
    workflow_run_id: string;
    durable_object_id: string;
  };
  console.log(`✅ Workflow started:`);
  console.log(`   Run ID: ${workflow_run_id}`);
  console.log(`   DO ID:  ${durable_object_id}\n`);

  // Connect WebSocket to stream events
  const wsUrl = `${API_BASE.replace(
    'https://',
    'wss://',
  )}/api/coordinator/${durable_object_id}/stream`;
  console.log(`📡 Connecting to WebSocket: ${wsUrl}\n`);

  const ws = new WebSocket(wsUrl);

  ws.addEventListener('open', () => {
    console.log('✅ WebSocket connected\n');
    console.log('📨 Streaming events:\n');
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    const timestamp = new Date(data.timestamp).toLocaleTimeString();
    console.log(`[${timestamp}] ${data.kind}`);
    if (Object.keys(data.payload).length > 0) {
      console.log(`   ${JSON.stringify(data.payload, null, 2)}`);
    }
    console.log();

    // Close after workflow completes
    if (data.kind === 'workflow_completed') {
      console.log('✅ Workflow completed!\n');
      ws.close();
      process.exit(0);
    }
  });

  ws.addEventListener('error', (error) => {
    console.error('❌ WebSocket error:', error);
    process.exit(1);
  });

  ws.addEventListener('close', () => {
    console.log('📪 WebSocket closed\n');
  });

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('⏱️  Timeout - closing connection\n');
    ws.close();
    process.exit(0);
  }, 30000);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
