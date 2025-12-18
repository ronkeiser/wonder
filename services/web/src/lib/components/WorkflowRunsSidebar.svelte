<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

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
  }

  let { selectedRunId = null, onSelect }: Props = $props();

  let runs = $state<WorkflowRunSummary[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let ws: WebSocket | null = null;

  async function fetchRuns() {
    try {
      const res = await fetch('/api/workflow-runs?limit=10');
      const data = await res.json();
      // API returns most recent first (ordered by created_at DESC)
      runs = data.runs;
    } catch (error) {
      console.error('Failed to fetch workflow runs:', error);
    }
  }

  function connectToEventHub() {
    status = 'connecting';

    // In local dev, connect directly to live API; otherwise use relative path
    const isLocalDev = window.location.hostname === 'localhost';
    const wsUrl = isLocalDev
      ? 'wss://api.wflow.app/workflow-runs/stream'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/workflow-runs/stream`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      status = 'connected';
      // Subscribe to all status changes (no filters)
      ws?.send(JSON.stringify({ type: 'subscribe', id: 'sidebar', filters: {} }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status_change') {
          updateRunStatus(msg.change);
        }
      } catch (e) {
        console.error('Failed to parse EventHub message:', e);
      }
    };

    ws.onerror = () => {
      status = 'disconnected';
    };

    ws.onclose = () => {
      status = 'disconnected';
      // Reconnect after 3 seconds
      setTimeout(connectToEventHub, 3000);
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

  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  onMount(() => {
    fetchRuns();
    connectToEventHub();
  });

  onDestroy(() => {
    ws?.close();
  });
</script>

<aside class="workflow-runs-sidebar">
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
        <span class="run-time">{formatTime(run.created_at)}</span>
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
    min-width: 220px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 3.75rem;
  }

  h3 {
    margin: 0;
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

  /* Scrollbar styles */
  .runs-list::-webkit-scrollbar {
    width: 8px;
  }

  .runs-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .runs-list::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .runs-list:hover::-webkit-scrollbar-thumb {
    background: var(--border);
  }

  .runs-list::-webkit-scrollbar-thumb:hover {
    background: #484f58;
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
