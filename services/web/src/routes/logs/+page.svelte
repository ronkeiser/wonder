<script lang="ts">
  import StreamViewer from '$lib/components/StreamViewer.svelte';
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';

  const tabs = [
    { id: 'events', label: 'Events', href: '/events' },
    { id: 'traces', label: 'Traces', href: '/events/trace' },
    { id: 'logs', label: 'Logs', href: '/logs' },
  ];

  const serviceOptions = [
    { value: 'coordinator', label: 'coordinator' },
    { value: 'executor', label: 'executor' },
    { value: 'events', label: 'events' },
    { value: 'logs', label: 'logs' },
    { value: 'resources', label: 'resources' },
    { value: 'http', label: 'http' },
  ];

  const levelColorMap: Record<string, string> = {
    error: 'var(--red)',
    warn: 'var(--yellow)',
    info: 'var(--blue)',
    debug: 'var(--gray)',
  };

  function getLogColor(item: any): string {
    return levelColorMap[item.level] || 'var(--gray)';
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
        color: levelColorMap[item.level] || 'var(--gray)',
      },
      identifier: item.service,
      message: item.message,
    };
  }
</script>

<svelte:head>
  <title>Logs</title>
</svelte:head>

<TabbedLayout {tabs} activeTabId="logs">
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
    renderItemHeader={renderLogHeader}
  />
</TabbedLayout>
