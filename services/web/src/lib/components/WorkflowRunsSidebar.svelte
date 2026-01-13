<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { timeAgo } from '$lib/time';

  type ExecutionMode = 'workflows' | 'conversations';

  interface WorkflowRunSummary {
    id: string;
    projectId: string;
    workflowId: string;
    workflowName: string;
    workflowDefId: string;
    workflowVersion: number;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    parentRunId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  }

  interface ConversationSummary {
    id: string;
    agentId: string;
    projectId: string;
    status: 'active' | 'waiting' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
  }

  interface ExecutionStatusChange {
    executionType: 'workflow' | 'conversation';
    streamId: string;
    executionId: string;
    definitionId: string;
    projectId: string;
    parentExecutionId: string | null;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    timestamp: number;
  }

  interface Props {
    selectedRunId?: string | null;
    onSelect?: (id: string | null) => void;
    width?: number;
  }

  let { selectedRunId = null, onSelect, width }: Props = $props();

  let mode = $state<ExecutionMode>('workflows');
  let runs = $state<WorkflowRunSummary[]>([]);
  let conversations = $state<ConversationSummary[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  // Clock tick for updating relative times - increments every minute
  let clockTick = $state(0);
  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let clockTimeout: ReturnType<typeof setTimeout> | null = null;

  async function fetchRuns() {
    try {
      const res = await fetch('/api/workflow-runs?limit=30');
      const data = await res.json();
      // API returns most recent first (ordered by created_at DESC)
      runs = data.runs;
    } catch (error) {
      console.error('Failed to fetch workflow runs:', error);
    }
  }

  async function fetchConversations() {
    try {
      const res = await fetch('/api/conversations?limit=30');
      const data = await res.json();
      conversations = data.conversations;
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    intentionalClose = true;
    if (ws) {
      ws.close();
      ws = null;
    }
    status = 'disconnected';
  }

  function connectToBroadcaster() {
    // Cancel any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    intentionalClose = false;
    status = 'connecting';

    // WebSocket connections go directly to the API service (can't proxy WS through SvelteKit)
    const wsUrl = 'wss://api.wflow.app/streams/status';
    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      if (ws !== socket) return;
      status = 'connected';
      // Subscribe to all status changes (no filters) - we filter client-side by mode
      socket.send(JSON.stringify({ type: 'subscribe', id: 'sidebar', filters: {} }));
    };

    socket.onmessage = (event) => {
      if (ws !== socket) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status_change') {
          handleStatusChange(msg.change);
        }
      } catch (e) {
        console.error('Failed to parse Broadcaster message:', e);
      }
    };

    socket.onerror = () => {
      if (ws !== socket) return;
      console.error('WebSocket error');
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      status = 'disconnected';

      if (!intentionalClose) {
        console.log('Broadcaster WebSocket closed, reconnecting in 3s...');
        reconnectTimeout = setTimeout(connectToBroadcaster, 3000);
      }
    };
  }

  function handleStatusChange(change: ExecutionStatusChange) {
    if (change.executionType === 'workflow') {
      const existingIndex = runs.findIndex((r) => r.id === change.executionId);
      if (existingIndex >= 0) {
        runs = runs.map((r, i) => (i === existingIndex ? { ...r, status: change.status } : r));
      } else {
        // New run - refetch to get full data
        fetchRuns();
      }
    } else if (change.executionType === 'conversation') {
      const existingIndex = conversations.findIndex((c) => c.id === change.executionId);
      if (existingIndex >= 0) {
        // Map execution status back to conversation status
        const convStatus = change.status === 'running' ? 'active' : change.status;
        conversations = conversations.map((c, i) =>
          i === existingIndex ? { ...c, status: convStatus as ConversationSummary['status'] } : c
        );
      } else {
        // New conversation - refetch to get full data
        fetchConversations();
      }
    }
  }

  function handleSelect(id: string) {
    if (selectedRunId === id) {
      // Deselect if clicking the same item
      onSelect?.(null);
    } else {
      onSelect?.(id);
    }
  }

  function handleModeChange(newMode: ExecutionMode) {
    mode = newMode;
    // Clear selection when switching modes
    onSelect?.(null);
    // Fetch data for the new mode if not already loaded
    if (newMode === 'workflows' && runs.length === 0) {
      fetchRuns();
    } else if (newMode === 'conversations' && conversations.length === 0) {
      fetchConversations();
    }
  }

  /**
   * Starts an interval synced to second 0 of each minute.
   * First waits until the next minute boundary, then runs every 60 seconds.
   */
  function startClockInterval() {
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    // Wait until the next minute boundary, then start the interval
    clockTimeout = setTimeout(() => {
      clockTick++;
      clockInterval = setInterval(() => {
        clockTick++;
      }, 60_000);
    }, msUntilNextMinute);
  }

  function stopClockInterval() {
    if (clockTimeout) {
      clearTimeout(clockTimeout);
      clockTimeout = null;
    }
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  /**
   * Compute relative time - depends on clockTick to trigger re-computation each minute
   */
  function getRelativeTime(timestamp: string): string {
    // Reference clockTick to create reactive dependency
    void clockTick;
    return timeAgo(timestamp);
  }

  /** Map conversation status to display status */
  function getDisplayStatus(status: string): 'running' | 'completed' | 'failed' | 'waiting' {
    return status === 'active' ? 'running' : (status as 'running' | 'completed' | 'failed' | 'waiting');
  }

  onMount(() => {
    fetchRuns();
    connectToBroadcaster();
    startClockInterval();
  });

  onDestroy(() => {
    disconnect();
    stopClockInterval();
  });
</script>

<aside
  class="w-[220px] min-w-40 max-w-[400px] bg-surface-raised border-r border-border flex flex-col overflow-hidden shrink-0 group/sidebar"
  style:width={width ? `${width}px` : undefined}
>
  <header class="h-16 px-4 border-b border-border flex justify-between items-center box-border gap-2">
    <select
      class="flex-1 py-1.5 px-2 pr-6 bg-surface-overlay bg-no-repeat bg-position-[right_0.25rem_center] bg-size-[14px] appearance-none border-none rounded-md text-foreground cursor-pointer text-sm font-semibold transition-colors duration-100 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
      style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23c9d1d9'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E&quot;)"
      bind:value={mode}
      onchange={(e) => handleModeChange(e.currentTarget.value as ExecutionMode)}
    >
      <option value="workflows">Workflow Runs</option>
      <option value="conversations">Conversations</option>
    </select>
    <span class="text-xs {status === 'connected' ? 'text-success' : 'text-foreground-muted'}">
      {status === 'connected' ? '●' : '○'}
    </span>
  </header>

  <div class="flex-1 overflow-y-auto p-2 scrollbar-thin">
    {#if mode === 'workflows'}
      {#each runs as run (run.id)}
        <button
          class="w-full p-2 border-none rounded cursor-pointer flex items-center gap-2 text-[0.8rem] text-left transition-colors duration-100 {run.id === selectedRunId ? 'bg-accent text-white' : 'bg-transparent text-foreground hover:bg-surface-hover'}"
          onclick={() => handleSelect(run.id)}
        >
          <span
            class="w-4 h-4 flex items-center justify-center shrink-0 {run.status === 'running' ? 'text-purple animate-pulse' : ''} {run.status === 'completed' ? 'text-success' : ''} {run.status === 'failed' ? 'text-error' : ''} {run.status === 'waiting' ? 'text-[#8b9eb3]' : ''} {run.id === selectedRunId ? 'text-inherit!' : ''}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
              {#if run.status === 'running'}
                <circle cx="12" cy="12" r="7" />
              {:else if run.status === 'completed'}
                <path d="M20 6 9 17l-5-5" />
              {:else if run.status === 'failed'}
                <path d="M18 6 6 18M6 6l12 12" />
              {:else if run.status === 'waiting'}
                <circle cx="12" cy="12" r="7" /><path d="M12 9v3l2.5 1.5" />
              {:else}
                <circle cx="12" cy="12" r="7" />
              {/if}
            </svg>
          </span>
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <span class="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{run.workflowName}</span>
            <span class="text-[0.7rem] font-mono {run.id === selectedRunId ? 'text-white/70' : 'text-foreground-muted'}">{run.id.slice(-6)}</span>
          </div>
          <span class="text-[0.7rem] {run.id === selectedRunId ? 'text-white/70' : 'text-foreground-muted'}">{getRelativeTime(run.createdAt)}</span>
        </button>
      {/each}

      {#if runs.length === 0}
        <div class="p-4 text-center text-foreground-muted text-[0.8rem]">No workflow runs</div>
      {/if}
    {:else}
      {#each conversations as conv (conv.id)}
        {@const displayStatus = getDisplayStatus(conv.status)}
        <button
          class="w-full p-2 border-none rounded cursor-pointer flex items-center gap-2 text-[0.8rem] text-left transition-colors duration-100 {conv.id === selectedRunId ? 'bg-accent text-white' : 'bg-transparent text-foreground hover:bg-surface-hover'}"
          onclick={() => handleSelect(conv.id)}
        >
          <span
            class="w-4 h-4 flex items-center justify-center shrink-0 {displayStatus === 'running' ? 'text-purple animate-pulse' : ''} {displayStatus === 'completed' ? 'text-success' : ''} {displayStatus === 'failed' ? 'text-error' : ''} {displayStatus === 'waiting' ? 'text-[#8b9eb3]' : ''} {conv.id === selectedRunId ? 'text-inherit!' : ''}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
              {#if displayStatus === 'running'}
                <circle cx="12" cy="12" r="7" />
              {:else if displayStatus === 'completed'}
                <path d="M20 6 9 17l-5-5" />
              {:else if displayStatus === 'failed'}
                <path d="M18 6 6 18M6 6l12 12" />
              {:else if displayStatus === 'waiting'}
                <circle cx="12" cy="12" r="7" /><path d="M12 9v3l2.5 1.5" />
              {:else}
                <circle cx="12" cy="12" r="7" />
              {/if}
            </svg>
          </span>
          <div class="flex-1 min-w-0 flex flex-col gap-0.5">
            <span class="font-medium whitespace-nowrap overflow-hidden text-ellipsis">Conversation</span>
            <span class="text-[0.7rem] font-mono {conv.id === selectedRunId ? 'text-white/70' : 'text-foreground-muted'}">{conv.id.slice(-6)}</span>
          </div>
          <span class="text-[0.7rem] {conv.id === selectedRunId ? 'text-white/70' : 'text-foreground-muted'}">{getRelativeTime(conv.createdAt)}</span>
        </button>
      {/each}

      {#if conversations.length === 0}
        <div class="p-4 text-center text-foreground-muted text-[0.8rem]">No conversations</div>
      {/if}
    {/if}
  </div>
</aside>

<style>
  /* Scrollbar styles - thumb visible on sidebar hover, hidden otherwise */
  .scrollbar-thin::-webkit-scrollbar {
    width: 12px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: transparent;
    background-clip: padding-box;
    border: 3px solid transparent;
    border-radius: 6px;
  }

  .group\/sidebar:hover .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
  }

  .group\/sidebar:hover .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: #484f58;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .animate-pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
</style>
