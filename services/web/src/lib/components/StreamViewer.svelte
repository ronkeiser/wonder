<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    type: 'events' | 'logs';
    apiPath: string;
    streamPath: string;
    filterType: 'event_type' | 'service';
    filterOptions: Array<{ value: string; label: string }>;
  }

  let { type, apiPath, streamPath, filterType, filterOptions }: Props = $props();

  let items = $state<any[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let currentFilter = $state('');
  let timeFilterMinutes = $state(5);
  let prettyPrintEnabled = $state(false);
  let ws: WebSocket | null = null;
  let seenIds = new Set<string>();

  const itemKey = type === 'events' ? 'event' : 'log';
  const itemsKey = type === 'events' ? 'events' : 'logs';

  function formatJsonPretty(obj: any) {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
      const unescaped = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return '"' + unescaped + '"';
    });
  }

  function formatTime(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  function getItemColor(item: any) {
    if (type === 'events') {
      const colorMap: Record<string, string> = {
        workflow_started: 'var(--blue)',
        workflow_completed: 'var(--green)',
        workflow_failed: 'var(--red)',
        task_started: 'var(--indigo)',
        task_completed: 'var(--violet)',
        task_failed: 'var(--orange)',
        error: 'var(--red)',
        warning: 'var(--yellow)',
      };
      return colorMap[item.event_type] || 'var(--gray)';
    } else {
      const levelMap: Record<string, string> = {
        error: 'var(--red)',
        warn: 'var(--yellow)',
        info: 'var(--blue)',
        debug: 'var(--gray)',
      };
      return levelMap[item.level] || 'var(--gray)';
    }
  }

  async function filterItemsByTime(minutes: number) {
    items = [];
    seenIds.clear();
    timeFilterMinutes = minutes;

    const cutoffTime = Date.now() - minutes * 60 * 1000;

    try {
      const url = new URL(apiPath, window.location.origin);
      url.searchParams.set('limit', '1000');
      if (currentFilter) {
        url.searchParams.set(filterType, currentFilter);
      }

      const response = await fetch(url);
      const data = await response.json();

      const filtered = data[itemsKey]
        .filter((item: any) => item.timestamp >= cutoffTime)
        .sort((a: any, b: any) => {
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
          if (type === 'events' && a.sequence_number && b.sequence_number) {
            return a.sequence_number - b.sequence_number;
          }
          return 0;
        });

      items = filtered;
      filtered.forEach((item: any) => seenIds.add(item.id));
    } catch (error) {
      console.error(`Failed to fetch ${type}:`, error);
    }
  }

  function addItem(item: any) {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);

    // Check if item matches current filter
    if (currentFilter) {
      const itemFilterValue = type === 'events' ? item.event_type : item.service;
      if (itemFilterValue !== currentFilter) return;
    }

    // Insert in sorted order
    const insertIndex = items.findIndex((existingItem) => {
      if (existingItem.timestamp !== item.timestamp) {
        return existingItem.timestamp > item.timestamp;
      }
      if (type === 'events' && existingItem.sequence_number && item.sequence_number) {
        return existingItem.sequence_number > item.sequence_number;
      }
      return false;
    });

    if (insertIndex === -1) {
      items = [...items, item];
    } else {
      items = [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)];
    }

    // Keep only last 1000 entries
    if (items.length > 1000) {
      items = items.slice(-1000);
    }

    // Trim seenIds set
    if (seenIds.size > 2000) {
      const idsArray = Array.from(seenIds);
      seenIds.clear();
      idsArray.slice(-1000).forEach((id) => seenIds.add(id));
    }
  }

  function connect() {
    status = 'connecting';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${streamPath}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      status = 'connected';
      console.log('WebSocket connected');

      if (type === 'events') {
        ws?.send(
          JSON.stringify({
            type: 'subscribe',
            id: 'events',
            stream: 'events',
            filters: {},
          }),
        );
      }
    };

    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);

        if (data.type === 'history') {
          data[itemsKey].forEach((item: any) => addItem(item));
        } else if (data.type === itemKey) {
          addItem(data[itemKey]);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      status = 'disconnected';
    };

    ws.onclose = () => {
      status = 'disconnected';
      console.log('WebSocket closed, reconnecting in 3s...');
      setTimeout(connect, 3000);
    };
  }

  function copyToClipboard(item: any) {
    const text = JSON.stringify(item, null, 2);
    navigator.clipboard.writeText(text);
  }

  onMount(() => {
    // Load filters from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const savedMinutes = urlParams.get('m');
    const savedFilter = urlParams.get(filterType);
    const savedPretty = urlParams.get('pretty');

    if (savedMinutes) timeFilterMinutes = parseInt(savedMinutes);
    if (savedFilter) currentFilter = savedFilter;
    if (savedPretty === '1') prettyPrintEnabled = true;

    filterItemsByTime(timeFilterMinutes);
    connect();
  });

  onDestroy(() => {
    ws?.close();
  });

  function handleFilterChange(value: string) {
    currentFilter = value;

    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(filterType, value);
    } else {
      url.searchParams.delete(filterType);
    }
    window.history.pushState({}, '', url);

    filterItemsByTime(timeFilterMinutes);
  }

  function handleTimeFilterChange(minutes: number) {
    timeFilterMinutes = minutes;

    const url = new URL(window.location.href);
    url.searchParams.set('m', minutes.toString());
    window.history.pushState({}, '', url);

    filterItemsByTime(minutes);
  }

  function togglePrettyPrint() {
    prettyPrintEnabled = !prettyPrintEnabled;

    const url = new URL(window.location.href);
    if (prettyPrintEnabled) {
      url.searchParams.set('pretty', '1');
    } else {
      url.searchParams.delete('pretty');
    }
    window.history.pushState({}, '', url);
  }
</script>

<div class="stream-viewer">
  <header>
    <h1>{type === 'events' ? 'Events' : 'Logs'}</h1>
    <div class="controls">
      <select
        class="filter-select"
        bind:value={currentFilter}
        onchange={(e) => handleFilterChange(e.currentTarget.value)}
      >
        <option value="">All {type === 'events' ? 'Event Types' : 'Services'}</option>
        {#each filterOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <div class="time-filters">
        {#each [5, 15, 60, 1440] as minutes}
          <button
            class="time-filter-btn"
            class:active={timeFilterMinutes === minutes}
            onclick={() => handleTimeFilterChange(minutes)}
          >
            {minutes < 60 ? `${minutes}m` : minutes === 60 ? '1h' : '24h'}
          </button>
        {/each}
      </div>

      <button
        class="pretty-print-toggle"
        class:active={prettyPrintEnabled}
        onclick={togglePrettyPrint}
      >
        Pretty
      </button>

      <button class="refresh-btn" onclick={() => filterItemsByTime(timeFilterMinutes)}>
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.501 5.501 0 008 2.5zM1.705 8.005a.75.75 0 01.834.656 5.501 5.501 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834z"
          ></path>
        </svg>
        Refresh
      </button>

      <span class="status {status}">{status}</span>
    </div>
  </header>

  <div class="items" id="items-container">
    {#each items as item (item.id)}
      <div class="item-entry" style="border-left-color: {getItemColor(item)}">
        <div class="item-content">
          <div class="item-header">
            <span class="item-time">{formatTime(item.timestamp)}</span>
            {#if type === 'events'}
              <span class="item-type">{item.event_type}</span>
              {#if item.workflow_id}
                <span class="item-id">workflow:{item.workflow_id}</span>
              {/if}
              {#if item.task_id}
                <span class="item-id">task:{item.task_id}</span>
              {/if}
            {:else}
              <span class="item-level">[{item.level}]</span>
              <span class="item-service">{item.service}</span>
              <span class="item-message">{item.message}</span>
            {/if}
          </div>
          {#if item.metadata && typeof item.metadata === 'object'}
            <pre class="item-metadata json-data">{prettyPrintEnabled
                ? formatJsonPretty(item.metadata)
                : JSON.stringify(item.metadata)}</pre>
          {:else if item.metadata}
            <pre class="item-metadata">{item.metadata}</pre>
          {/if}
        </div>
        <button class="copy-btn" onclick={() => copyToClipboard(item)} title="Copy to clipboard">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
            ></path>
            <path
              d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
            ></path>
          </svg>
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  :root {
    --red: #f85149;
    --orange: #ffb640;
    --yellow: #ffe44a;
    --green: #38a05c;
    --blue: #56a5ff;
    --indigo: #8a5cff;
    --violet: #bf76ff;
    --pink: #ff77bd;

    --gray: #30363d;
    --gray-dark: #21262d;
    --gray-darker: #161b22;
    --gray-darkest: #0d1117;
    --gray-light: #8b949e;
    --gray-lighter: #c9d1d9;
    --blue-light: #a5d6ff;

    --bg-primary: var(--gray-darkest);
    --bg-secondary: var(--gray-darker);
    --bg-tertiary: var(--gray-dark);
    --bg-hover: var(--gray);
    --text-primary: var(--gray-lighter);
    --text-secondary: var(--gray-light);
    --text-link: var(--blue-light);
    --border: var(--gray);
    --accent: var(--blue);
    --accent-emphasis: #58a6ff80;
  }

  .stream-viewer {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  header {
    background: var(--bg-secondary);
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .filter-select {
    padding: 0.375rem 0.75rem;
    padding-right: 2rem;
    background: var(--bg-tertiary);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23c9d1d9'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 16px;
    appearance: none;
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 0.1s;
  }

  .filter-select:hover {
    background-color: var(--bg-hover);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23c9d1d9'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E");
  }

  .filter-select:focus {
    outline: none;
  }

  .filter-select:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-emphasis);
  }

  .time-filters {
    display: flex;
    gap: 0.5rem;
  }

  .time-filter-btn {
    padding: 0.375rem 0.75rem;
    background: var(--bg-tertiary);
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 0.1s;
  }

  .time-filter-btn:hover {
    background: var(--bg-hover);
  }

  .time-filter-btn:focus {
    outline: none;
  }

  .time-filter-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-emphasis);
  }

  .time-filter-btn.active {
    background: var(--accent);
    color: #000;
  }

  .pretty-print-toggle {
    padding: 0.375rem 0.75rem;
    background: var(--bg-tertiary);
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 0.1s;
  }

  .pretty-print-toggle:hover {
    background: var(--bg-hover);
  }

  .pretty-print-toggle:focus {
    outline: none;
  }

  .pretty-print-toggle:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-emphasis);
  }

  .pretty-print-toggle.active {
    background: var(--accent);
    color: #000;
  }

  .refresh-btn {
    padding: 0.375rem 0.75rem;
    background: var(--bg-tertiary);
    border: none;
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    transition:
      background 0.1s,
      transform 0.1s;
  }

  .refresh-btn:hover {
    background: var(--bg-hover);
  }

  .refresh-btn:focus {
    outline: none;
  }

  .refresh-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-emphasis);
  }

  .refresh-btn:active {
    transform: scale(0.95);
  }

  .refresh-btn svg {
    width: 14px;
    height: 14px;
  }

  .status {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status.connected {
    background: var(--green);
    color: #fff;
  }

  .status.disconnected {
    background: var(--red);
    color: #fff;
  }

  .status.connecting {
    background: var(--orange);
    color: #fff;
  }

  .items {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .item-entry {
    padding: 0.5rem;
    margin-bottom: 0.25rem;
    border-left: 3px solid transparent;
    font-size: 0.875rem;
    line-height: 1.5;
    display: flex;
    align-items: flex-start;
    position: relative;
  }

  .item-entry:hover {
    background: var(--bg-secondary);
  }

  .item-entry:hover .copy-btn {
    opacity: 1;
  }

  .item-content {
    flex: 1;
  }

  .item-header {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .item-time {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .item-type,
  .item-level {
    color: var(--accent);
    font-weight: 600;
  }

  .item-service {
    color: var(--text-secondary);
  }

  .item-id {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .item-message {
    color: var(--text-primary);
  }

  .item-metadata {
    margin-top: 0.25rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .copy-btn {
    opacity: 0;
    margin-left: auto;
    padding: 0.25rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 0.125rem;
    transition:
      background 0.2s,
      color 0.2s,
      border-color 0.2s;
  }

  .copy-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--text-primary);
  }

  .copy-btn svg {
    width: 14px;
    height: 14px;
    display: block;
  }

  ::-webkit-scrollbar {
    width: 12px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 6px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #484f58;
  }
</style>
