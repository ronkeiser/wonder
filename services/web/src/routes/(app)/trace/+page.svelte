<script lang="ts">
  import { onMount } from 'svelte';
  import StreamViewer from '$lib/components/StreamViewer.svelte';
  import WorkflowRunsSidebar from '$lib/components/WorkflowRunsSidebar.svelte';

  let selectedRunId = $state<string | null>(null);

  // Sidebar resize state
  const STORAGE_KEY = 'sidebar-width';
  const DEFAULT_WIDTH = 220;
  const MIN_WIDTH = 160;
  const MAX_WIDTH = 400;

  let sidebarWidth = $state(DEFAULT_WIDTH);
  let isResizing = $state(false);

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        sidebarWidth = parsed;
      }
    }
  });

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;

    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      sidebarWidth = newWidth;
    }

    function onMouseUp() {
      isResizing = false;
      localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  const categoryOptions = [
    { value: 'decision', label: 'decision' },
    { value: 'operation', label: 'operation' },
    { value: 'dispatch', label: 'dispatch' },
    { value: 'sql', label: 'sql' },
  ];

  const categoryColorMap: Record<string, string> = {
    decision: 'var(--color-green)',
    operation: 'var(--color-gray-light)',
    dispatch: 'var(--color-pink)',
    sql: 'var(--color-violet)',
  };

  function getTraceColor(item: any): string {
    return categoryColorMap[item.category] || 'var(--color-gray)';
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
    if (item.tokenId) {
      parts.push(`token:${item.tokenId.slice(-8)}`);
    }

    // Add node context if present
    if (item.nodeId) {
      parts.push(`node:${item.nodeId.slice(-8)}`);
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
        color: categoryColorMap[item.category] || 'var(--color-gray)',
      },
      identifier: `${item.workflowRunId.slice(-8)}-${item.sequence}`,
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

<div
  class="flex h-full overflow-hidden {isResizing ? 'cursor-col-resize select-none' : ''}"
  class:resizing={isResizing}
>
  <WorkflowRunsSidebar
    width={sidebarWidth}
    selectedRunId={selectedRunId}
    onSelect={(id) => (selectedRunId = id)}
  />
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="w-1.5 cursor-col-resize bg-surface shrink-0 flex flex-col group"
    class:bg-accent={isResizing}
    onmousedown={handleResizeStart}
  >
    <div
      class="h-16 bg-surface-raised border-b border-border box-border group-hover:bg-accent group-hover:border-accent {isResizing ? 'bg-accent border-accent' : ''}"
    ></div>
  </div>
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
  .resizing :global(.stream-viewer) {
    flex: 1;
    min-width: 0;
  }

  div:not(.resizing) :global(.stream-viewer) {
    flex: 1;
    min-width: 0;
  }

  .group:hover {
    background: var(--color-accent);
  }
</style>
