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
        color: categoryColorMap[item.category] || 'var(--gray)',
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

<div class="page-with-sidebar" class:resizing={isResizing}>
  <WorkflowRunsSidebar
    width={sidebarWidth}
    selectedRunId={selectedRunId}
    onSelect={(id) => (selectedRunId = id)}
  />
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={handleResizeStart}>
    <div class="resize-handle-header"></div>
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
  .page-with-sidebar {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .page-with-sidebar.resizing {
    cursor: col-resize;
    user-select: none;
  }

  .resize-handle {
    width: 6px;
    cursor: col-resize;
    background: var(--bg-primary);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  .resize-handle-header {
    height: 64px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    box-sizing: border-box;
  }

  .resize-handle:hover,
  .resizing .resize-handle {
    background: var(--accent);
  }

  .resize-handle:hover .resize-handle-header,
  .resizing .resize-handle .resize-handle-header {
    background: var(--accent);
    border-bottom-color: var(--accent);
  }

  .page-with-sidebar :global(.stream-viewer) {
    flex: 1;
    min-width: 0;
  }
</style>
