<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { timeAgo } from '$lib/time';

  interface WorkflowRunSummary {
    id: string;
    project_id: string;
    workflow_id: string;
    workflow_name: string;
    workflow_def_id: string;
    workflow_version: number;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    parent_run_id: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }

  interface WorkflowStatusChange {
    workflow_run_id: string;
    workflow_def_id: string;
    project_id: string;
    parent_run_id: string | null;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    timestamp: number;
  }

  interface Props {
    selectedRunId?: string | null;
    onSelect?: (id: string | null) => void;
    width?: number;
  }

  let { selectedRunId = null, onSelect, width }: Props = $props();

  let runs = $state<WorkflowRunSummary[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

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

  function connectToEventHub() {
    // Cancel any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    intentionalClose = false;
    status = 'connecting';

    // WebSocket connections go directly to the API service (can't proxy WS through SvelteKit)
    const wsUrl = 'wss://api.wflow.app/workflow-runs/stream';
    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      if (ws !== socket) return;
      status = 'connected';
      // Subscribe to all status changes (no filters)
      socket.send(JSON.stringify({ type: 'subscribe', id: 'sidebar', filters: {} }));
    };

    socket.onmessage = (event) => {
      if (ws !== socket) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status_change') {
          updateRunStatus(msg.change);
        }
      } catch (e) {
        console.error('Failed to parse EventHub message:', e);
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
        console.log('EventHub WebSocket closed, reconnecting in 3s...');
        reconnectTimeout = setTimeout(connectToEventHub, 3000);
      }
    };
  }

  function updateRunStatus(change: WorkflowStatusChange) {
    const existingIndex = runs.findIndex((r) => r.id === change.workflow_run_id);

    if (existingIndex >= 0) {
      // Update existing run's status
      runs = runs.map((r, i) => (i === existingIndex ? { ...r, status: change.status } : r));
    } else {
      // New run - prepend to list (we only have partial info, so fetch fresh list)
      // For now, just refetch to get full run data
      fetchRuns();
    }
  }

  function handleSelect(id: string) {
    if (selectedRunId === id) {
      // Deselect if clicking the same run
      onSelect?.(null);
    } else {
      onSelect?.(id);
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return '●';
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'waiting':
        return '○';
      default:
        return '?';
    }
  }

  onMount(() => {
    fetchRuns();
    connectToEventHub();
  });

  onDestroy(() => {
    disconnect();
  });
</script>

<aside class="workflow-runs-sidebar" style:width={width ? `${width}px` : undefined}>
  <header>
    <h3>Workflow Runs</h3>
    <span class="ws-status {status}">{status === 'connected' ? '●' : '○'}</span>
  </header>

  <div class="runs-list">
    {#each runs as run (run.id)}
      <button
        class="run-item"
        class:selected={run.id === selectedRunId}
        onclick={() => handleSelect(run.id)}
      >
        <span class="status-icon status-{run.status}">{getStatusIcon(run.status)}</span>
        <div class="run-info">
          <span class="workflow-name">{run.workflow_name}</span>
          <span class="run-id">{run.id.slice(-6)}</span>
        </div>
        <span class="run-time">{timeAgo(run.created_at)}</span>
      </button>
    {/each}

    {#if runs.length === 0}
      <div class="empty-state">No workflow runs</div>
    {/if}
  </div>
</aside>

<style>
  .workflow-runs-sidebar {
    width: 220px;
    min-width: 160px;
    max-width: 400px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  header {
    height: 64px;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;
  }

  h3 {
    margin: 0;
    padding: 0.375rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .ws-status {
    font-size: 0.75rem;
  }

  .ws-status.connected {
    color: var(--green);
  }

  .ws-status.disconnected,
  .ws-status.connecting {
    color: var(--text-secondary);
  }

  .runs-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* Scrollbar styles - thumb visible on sidebar hover, hidden otherwise */
  .runs-list::-webkit-scrollbar {
    width: 12px;
  }

  .runs-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .runs-list::-webkit-scrollbar-thumb {
    background-color: transparent;
    background-clip: padding-box;
    border: 3px solid transparent;
    border-radius: 6px;
  }

  .workflow-runs-sidebar:hover .runs-list::-webkit-scrollbar-thumb {
    background-color: var(--border);
  }

  .workflow-runs-sidebar:hover .runs-list::-webkit-scrollbar-thumb:hover {
    background-color: #484f58;
  }

  .run-item {
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
    text-align: left;
    transition: background 0.1s;
  }

  .run-item:hover {
    background: var(--bg-hover);
  }

  .run-item.selected {
    background: var(--accent);
    color: #fff;
  }

  .status-icon {
    font-size: 0.75rem;
    width: 1rem;
    text-align: center;
  }

  .status-running {
    color: var(--purple, #a855f7);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .status-completed {
    color: var(--green);
  }

  .status-failed {
    color: var(--red);
  }

  .status-waiting {
    color: var(--yellow, #eab308);
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

  .run-item.selected .status-icon {
    color: inherit;
  }

  .run-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .workflow-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .run-id {
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-family: monospace;
  }

  .run-item.selected .run-id {
    color: rgba(255, 255, 255, 0.7);
  }

  .run-time {
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  .run-item.selected .run-time {
    color: rgba(255, 255, 255, 0.7);
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8rem;
  }
</style>
