<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';

  const eventTypeOptions = [
    // Workflow lifecycle
    { value: 'workflow.started', label: 'workflow.started' },
    { value: 'workflow.completed', label: 'workflow.completed' },
    { value: 'workflow.failed', label: 'workflow.failed' },

    // Task execution
    { value: 'task.dispatched', label: 'task.dispatched' },
    { value: 'task.completed', label: 'task.completed' },
    { value: 'task.failed', label: 'task.failed' },

    // Token lifecycle
    { value: 'token.created', label: 'token.created' },
    { value: 'token.completed', label: 'token.completed' },
    { value: 'token.failed', label: 'token.failed' },
    { value: 'token.waiting', label: 'token.waiting' },

    // Context updates
    { value: 'context.updated', label: 'context.updated' },
    { value: 'context.output_applied', label: 'context.output_applied' },

    // Fan-out/Fan-in
    { value: 'fan_out.started', label: 'fan_out.started' },
    { value: 'fan_in.completed', label: 'fan_in.completed' },
    { value: 'branches.merged', label: 'branches.merged' },
  ];

  const colorMap: Record<string, string> = {
    // Workflow lifecycle - pink/green/red family
    'workflow.started': 'var(--pink)',
    'workflow.completed': 'var(--green)',
    'workflow.failed': 'var(--red)',

    // Task execution - blue/indigo/violet family
    'task.dispatched': 'var(--blue)',
    'task.completed': 'var(--indigo)',
    'task.failed': 'var(--violet)',

    // Token lifecycle - teal/cyan/orange family
    'token.created': 'var(--teal)',
    'token.completed': 'var(--cyan)',
    'token.failed': 'var(--orange)',
    'token.waiting': 'var(--yellow)',

    // Context updates - purple family
    'context.updated': 'var(--purple)',
    'context.output_applied': 'var(--purple-light)',

    // Fan-out/Fan-in - lime/emerald family (parallel execution)
    'fan_out.started': 'var(--lime)',
    'fan_in.completed': 'var(--emerald)',
    'branches.merged': 'var(--emerald-light)',
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
        color: colorMap[item.event_type] || 'var(--gray-lighter)',
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
