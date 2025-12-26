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

    // Subworkflow lifecycle
    { value: 'subworkflow.dispatched', label: 'subworkflow.dispatched' },
    { value: 'subworkflow.waiting', label: 'subworkflow.waiting' },
    { value: 'subworkflow.started', label: 'subworkflow.started' },
    { value: 'subworkflow.completed', label: 'subworkflow.completed' },
    { value: 'subworkflow.result_received', label: 'subworkflow.result_received' },
    { value: 'subworkflow.failed', label: 'subworkflow.failed' },
    { value: 'subworkflow.timeout', label: 'subworkflow.timeout' },
  ];

  const colorMap: Record<string, string> = {
    // Workflow lifecycle - pink/green/red family
    'workflow.started': 'var(--color-pink)',
    'workflow.completed': 'var(--color-green)',
    'workflow.failed': 'var(--color-red)',

    // Task execution - blue/indigo/violet family
    'task.dispatched': 'var(--color-blue)',
    'task.completed': 'var(--color-purple-light)',
    'task.failed': 'var(--color-violet)',

    // Token lifecycle - teal/cyan/orange family
    'token.created': 'var(--color-teal)',
    'token.completed': 'var(--color-cyan)',
    'token.failed': 'var(--color-orange)',
    'token.waiting': 'var(--color-yellow)',

    // Context updates - purple family
    'context.updated': 'var(--color-purple)',
    'context.output_applied': 'var(--color-purple-light)',

    // Fan-out/Fan-in - lime/emerald family (parallel execution)
    'fan_out.started': 'var(--color-lime)',
    'fan_in.completed': 'var(--color-emerald)',
    'branches.merged': 'var(--color-emerald-light)',

    // Subworkflow lifecycle - indigo/violet family
    'subworkflow.dispatched': 'var(--color-indigo)',
    'subworkflow.waiting': 'var(--color-indigo-light)',
    'subworkflow.started': 'var(--color-violet)',
    'subworkflow.completed': 'var(--color-violet)',
    'subworkflow.result_received': 'var(--color-purple)',
    'subworkflow.failed': 'var(--color-red)',
    'subworkflow.timeout': 'var(--color-orange)',
  };

  function getEventColor(item: any): string {
    return colorMap[item.eventType] || 'var(--color-gray)';
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
        color: colorMap[item.eventType] || 'var(--color-gray-lighter)',
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

<div
  class="flex h-full overflow-hidden {isResizing ? 'cursor-col-resize select-none' : ''}"
  class:resizing={isResizing}
>
  <WorkflowRunsSidebar
    width={sidebarWidth}
    {selectedRunId}
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
