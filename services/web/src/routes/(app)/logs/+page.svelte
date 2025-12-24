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

  const levelColorMap: Record<string, string> = {
    error: 'var(--color-red)',
    warn: 'var(--color-yellow)',
    info: 'var(--color-blue)',
    debug: 'var(--color-gray)',
  };

  function getLogColor(item: any): string {
    return levelColorMap[item.level] || 'var(--color-gray)';
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

  function renderLogHeader(item: any) {
    return {
      time: formatTime(item.timestamp),
      badge: {
        text: item.level.toUpperCase(),
        color: levelColorMap[item.level] || 'var(--color-gray)',
      },
      identifier: item.service,
      message: item.message,
    };
  }

  function getLogMetadata(item: any) {
    return item.metadata;
  }
</script>

<svelte:head>
  <title>Logs</title>
</svelte:head>

<StreamViewer
  title="Logs"
  apiPath="/api/logs"
  streamPath="/api/logs/stream"
  filterLabel="Services"
  filterParam="service"
  filterOptions={serviceOptions}
  itemsKey="logs"
  itemKey="log"
  getItemColor={getLogColor}
  getMetadata={getLogMetadata}
  renderItemHeader={renderLogHeader}
/>
