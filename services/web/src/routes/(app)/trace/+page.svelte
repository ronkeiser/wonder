<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';
  import WorkflowRunsSidebar from '$lib/components/WorkflowRunsSidebar.svelte';

  let selectedRunId = $state<string | null>(null);

  const categoryOptions = [
    { value: 'decision', label: 'decision' },
    { value: 'operation', label: 'operation' },
    { value: 'dispatch', label: 'dispatch' },
    { value: 'sql', label: 'sql' },
  ];

  const categoryColorMap: Record<string, string> = {
    decision: 'var(--green)',
    operation: 'var(--gray-light)',
    dispatch: 'var(--pink)',
    sql: 'var(--violet)',
  };

  function getTraceColor(item: any): string {
    return categoryColorMap[item.category] || 'var(--gray)';
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  function renderTraceHeader(item: any) {
    const parts: string[] = [];

    // Add token context if present
    if (item.token_id) {
      parts.push(`token:${item.token_id.slice(-8)}`);
    }

    // Add node context if present
    if (item.node_id) {
      parts.push(`node:${item.node_id.slice(-8)}`);
    }

    // Determine the message to display
    let message: string;
    if (item.category === 'sql' && item.payload?.sql) {
      message = item.payload.sql;
    } else {
      message = item.type;
    }

    // Append context parts if we have them
    if (parts.length > 0) {
      message = `${message} • ${parts.join(' • ')}`;
    }

    return {
      time: formatTime(item.timestamp),
      badge: {
        text: item.category,
        color: categoryColorMap[item.category] || 'var(--gray)',
      },
      identifier: `${item.workflow_run_id.slice(-8)}-${item.sequence}`,
      message,
    };
  }

  function getTraceMetadata(item: any) {
    return item.payload;
  }

  const subscribeMessage = {
    type: 'subscribe',
    id: 'traces',
    stream: 'trace',
    filters: {},
  };
</script>

<svelte:head>
  <title>Trace Events</title>
</svelte:head>

<div class="page-with-sidebar">
  <WorkflowRunsSidebar selectedRunId={selectedRunId} onSelect={(id) => (selectedRunId = id)} />
  <StreamViewer
    title="Trace Events"
    apiPath="/api/events/trace"
    filterLabel="Categories"
    filterParam="category"
    filterOptions={categoryOptions}
    itemsKey="events"
    itemKey="event"
    {subscribeMessage}
    workflowRunId={selectedRunId}
    getItemColor={getTraceColor}
    getMetadata={getTraceMetadata}
    renderItemHeader={renderTraceHeader}
  />
</div>

<style>
  .page-with-sidebar {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .page-with-sidebar :global(.stream-viewer) {
    flex: 1;
    min-width: 0;
  }
</style>
