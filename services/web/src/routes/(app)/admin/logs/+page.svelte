<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';

  const serviceOptions = [
    { value: 'agent', label: 'agent' },
    { value: 'coordinator', label: 'coordinator' },
    { value: 'executor', label: 'executor' },
    { value: 'events', label: 'events' },
    { value: 'logs', label: 'logs' },
    { value: 'resources', label: 'resources' },
    { value: 'http', label: 'http' },
  ];

  const levelOptions = [
    { value: 'fatal', label: 'fatal' },
    { value: 'error', label: 'error' },
    { value: 'warn', label: 'warn' },
    { value: 'info', label: 'info' },
    { value: 'debug', label: 'debug' },
  ];

  const levelColorMap: Record<string, string> = {
    fatal: 'var(--color-red)',
    error: 'var(--color-orange)',
    warn: 'var(--color-yellow)',
    info: 'var(--color-blue)',
    debug: 'var(--color-gray-lighter)',
  };

  function getLogColor(item: any): string {
    return levelColorMap[item.level] || 'var(--color-gray)';
  }

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  function formatTime(timestamp: number): string {
    return timeFormatter.format(new Date(timestamp));
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
  streamPath="/logs/stream"
  filterLabel="Services"
  filterParam="service"
  filterOptions={serviceOptions}
  secondaryFilter={{ label: 'Levels', param: 'level', options: levelOptions }}
  itemsKey="logs"
  itemKey="log"
  defaultTimeFilter={5}
  getItemColor={getLogColor}
  getMetadata={getLogMetadata}
  renderItemHeader={renderLogHeader}
/>
