<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';

  const eventTypeOptions = [
    { value: 'workflow_started', label: 'workflow_started' },
    { value: 'workflow_completed', label: 'workflow_completed' },
    { value: 'workflow_failed', label: 'workflow_failed' },
    { value: 'task_started', label: 'task_started' },
    { value: 'task_completed', label: 'task_completed' },
    { value: 'task_failed', label: 'task_failed' },
  ];

  const colorMap: Record<string, string> = {
    workflow_started: 'var(--pink)',
    workflow_completed: 'var(--green)',
    workflow_failed: 'var(--red)',
    task_started: 'var(--indigo)',
    task_completed: 'var(--violet)',
    task_failed: 'var(--orange)',
    error: 'var(--red)',
    warning: 'var(--yellow)',
  };

  function getEventColor(item: any): string {
    return colorMap[item.event_type] || 'var(--gray)';
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

  function renderEventHeader(item: any) {
    return {
      time: formatTime(item.timestamp),
      badge: {
        text: item.event_type,
        color: colorMap[item.event_type] || 'var(--gray)',
      },
      identifier: item.workflow_run_id ? item.workflow_run_id.slice(-8) : undefined,
      message: item.message,
    };
  }

  function getEventMetadata(item: any) {
    return item.metadata;
  }

  const subscribeMessage = {
    type: 'subscribe',
    id: 'events',
    stream: 'events',
    filters: {},
  };
</script>

<svelte:head>
  <title>Events</title>
</svelte:head>

<StreamViewer
  title="Events"
  apiPath="/api/events"
  streamPath="/api/events/stream"
  filterLabel="Event Types"
  filterParam="event_type"
  filterOptions={eventTypeOptions}
  itemsKey="events"
  itemKey="event"
  {subscribeMessage}
  getItemColor={getEventColor}
  getMetadata={getEventMetadata}
  renderItemHeader={renderEventHeader}
/>
