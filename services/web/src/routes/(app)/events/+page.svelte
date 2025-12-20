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
    'task.completed': 'var(--purple-light)',
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
    return colorMap[item.eventType] || 'var(--gray)';
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
        text: item.eventType,
        color: colorMap[item.eventType] || 'var(--gray-lighter)',
      },
      identifier: item.workflowRunId ? item.workflowRunId.slice(-8) : undefined,
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
    title="Events"
    apiPath="/api/events"
    filterLabel="Event Types"
    filterParam="eventType"
    filterOptions={eventTypeOptions}
    itemsKey="events"
    itemKey="event"
    {subscribeMessage}
    workflowRunId={selectedRunId}
    getItemColor={getEventColor}
    getMetadata={getEventMetadata}
    renderItemHeader={renderEventHeader}
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
