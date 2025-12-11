<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';

  const tabs = [
    { id: 'events', label: 'Events', href: '/events' },
    { id: 'traces', label: 'Traces', href: '/events/trace' },
    { id: 'logs', label: 'Logs', href: '/logs' },
  ];

  const categoryOptions = [
    { value: 'decision', label: 'decision' },
    { value: 'operation', label: 'operation' },
    { value: 'dispatch', label: 'dispatch' },
    { value: 'sql', label: 'sql' },
  ];

  const categoryColorMap: Record<string, string> = {
    decision: 'var(--indigo)',
    operation: 'var(--violet)',
    dispatch: 'var(--pink)',
    sql: 'var(--orange)',
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

    // Add duration if present
    if (item.duration_ms !== null && item.duration_ms !== undefined) {
      parts.push(`${item.duration_ms.toFixed(2)}ms`);
    }

    // Add token context if present
    if (item.token_id) {
      parts.push(`token:${item.token_id.slice(-8)}`);
    }

    // Add node context if present
    if (item.node_id) {
      parts.push(`node:${item.node_id.slice(-8)}`);
    }

    return {
      time: formatTime(item.timestamp),
      badge: {
        text: item.category,
        color: categoryColorMap[item.category] || 'var(--gray)',
      },
      identifier: `${item.workflow_run_id.slice(-8)}-${item.sequence}`,
      message: parts.length > 0 ? parts.join(' • ') : item.type,
    };
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

<TabbedLayout {tabs} activeTabId="traces">
  <StreamViewer
    title="Trace Events"
    apiPath="/api/events/trace"
    streamPath="/api/events/stream"
    filterLabel="Categories"
    filterParam="category"
    filterOptions={categoryOptions}
    itemsKey="events"
    itemKey="event"
    {subscribeMessage}
    getItemColor={getTraceColor}
    renderItemHeader={renderTraceHeader}
  />
</TabbedLayout>
