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
</script>

<svelte:head>
  <title>Events</title>
</svelte:head>

<StreamViewer
  type="events"
  apiPath="/api/events"
  streamPath="/api/events/stream"
  filterType="event_type"
  filterOptions={eventTypeOptions}
/>
