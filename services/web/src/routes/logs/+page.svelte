<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';

  const serviceOptions = [
    { value: 'coordinator', label: 'coordinator' },
    { value: 'executor', label: 'executor' },
    { value: 'events', label: 'events' },
    { value: 'logs', label: 'logs' },
    { value: 'resources', label: 'resources' },
    { value: 'http', label: 'http' },
  ];
</script>

<svelte:head>
  <title>Logs</title>
</svelte:head>

<StreamViewer
  type="logs"
  apiPath="/api/logs"
  streamPath="/api/logs/stream"
  filterType="service"
  filterOptions={serviceOptions}
/>
