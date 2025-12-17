<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import StreamItem from './StreamItem.svelte';

  interface Props {
    title: string;
    apiPath: string;
    streamPath: string;
    filterLabel: string;
    filterParam: string;
    filterOptions: Array<{ value: string; label: string }>;
    itemsKey: string; // e.g., 'events' or 'logs'
    itemKey: string; // e.g., 'event' or 'log'
    subscribeMessage?: object; // Optional WebSocket subscription message
    getItemColor?: (item: any) => string;
    getMetadata?: (item: any) => any;
    renderItemHeader: (item: any) => {
      time: string;
      badge: { text: string; color: string };
      identifier?: string;
      message?: string;
    };
  }

  let {
    title,
    apiPath,
    streamPath,
    filterLabel,
    filterParam,
    filterOptions,
    itemsKey,
    itemKey,
    subscribeMessage,
    getItemColor,
    getMetadata,
    renderItemHeader,
  }: Props = $props();

  let items = $state<any[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let currentFilter = $state('');
  let timeFilterMinutes = $state(5);
  let prettyPrintEnabled = $state(false);
  let identifierFilters = $state<string[]>([]);
  let ws: WebSocket | null = null;
  let seenIds = new Set<string>();

  function getColor(item: any): string {
    if (getItemColor) {
      return getItemColor(item);
    }
    return 'var(--gray)';
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
        url.searchParams.set(filterParam, currentFilter);
      }

      const response = await fetch(url);
      const data = await response.json();

      // Handle both array response and object response
      const rawItems = Array.isArray(data) ? data : data[itemsKey];

      const filtered = rawItems
        .filter((item: any) => item.timestamp >= cutoffTime)
        .sort((a: any, b: any) => {
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
          // Sort by sequence for tie-breaking
          if (a.sequence !== undefined && b.sequence !== undefined) {
            return a.sequence - b.sequence;
          }
          return 0;
        });

      items = filtered;
      filtered.forEach((item: any) => seenIds.add(item.id));

      // Scroll to bottom after DOM updates
      setTimeout(() => {
        const container = document.getElementById('items-container');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 0);
    } catch (error) {
      console.error(`Failed to fetch items:`, error);
    }
  }

  function addItem(item: any) {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);

    // Check if item matches current filter
    if (currentFilter) {
      const itemFilterValue = item[filterParam];
      if (itemFilterValue !== currentFilter) return;
    }

    // Insert in sorted order
    const insertIndex = items.findIndex((existingItem) => {
      if (existingItem.timestamp !== item.timestamp) {
        return existingItem.timestamp > item.timestamp;
      }
      // Sort by sequence for tie-breaking
      if (existingItem.sequence !== undefined && item.sequence !== undefined) {
        return existingItem.sequence > item.sequence;
      }
      return false;
    });

    if (insertIndex === -1) {
      items = [...items, item];
    } else {
      items = [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)];
    }

    // Auto-scroll to bottom after DOM updates
    setTimeout(() => {
      const container = document.getElementById('items-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);

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

      if (subscribeMessage) {
        ws?.send(JSON.stringify(subscribeMessage));
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

  let copyAllStatus = $state<'idle' | 'copied'>('idle');
  let copyAllTimeout: ReturnType<typeof setTimeout> | null = null;

  function copyAllToClipboard() {
    const text = JSON.stringify(filteredItems, null, 2);
    navigator.clipboard.writeText(text);

    // Show feedback
    copyAllStatus = 'copied';
    if (copyAllTimeout) clearTimeout(copyAllTimeout);
    copyAllTimeout = setTimeout(() => {
      copyAllStatus = 'idle';
    }, 2000);
  }

  onMount(() => {
    // Load filters from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const savedMinutes = urlParams.get('m');
    const savedFilter = urlParams.get(filterParam);
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
      url.searchParams.set(filterParam, value);
    } else {
      url.searchParams.delete(filterParam);
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

  function addIdentifierFilter(identifier: string) {
    if (!identifierFilters.includes(identifier)) {
      identifierFilters = [...identifierFilters, identifier];
    }
  }

  function removeIdentifierFilter(identifier: string) {
    identifierFilters = identifierFilters.filter((f) => f !== identifier);
  }

  // Filter items by identifier chips (client-side filtering)
  const filteredItems = $derived.by(() => {
    if (identifierFilters.length === 0) return items;
    return items.filter((item) => {
      const header = renderItemHeader(item);
      return header.identifier && identifierFilters.includes(header.identifier);
    });
  });
</script>

<div class="stream-viewer">
  <header>
    <div class="left-controls">
      <select
        class="filter-select"
        bind:value={currentFilter}
        onchange={(e) => handleFilterChange(e.currentTarget.value)}
      >
        <option value="">All {filterLabel}</option>
        {#each filterOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <span class="status {status}">{status}</span>
    </div>
    <div class="right-controls">
      <div class="time-filters">
        {#each [1, 5, 15, 60, 1440] as minutes}
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
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm.75 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"
          ></path>
        </svg>
        Pretty
      </button>

      <button
        class="copy-all-btn"
        class:copied={copyAllStatus === 'copied'}
        onclick={copyAllToClipboard}
        disabled={filteredItems.length === 0}
      >
        {#if copyAllStatus === 'copied'}
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
            ></path>
          </svg>
          Copied!
        {:else}
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
            ></path>
            <path
              d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
            ></path>
          </svg>
          Copy All ({filteredItems.length})
        {/if}
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
    </div>
  </header>

  {#if identifierFilters.length > 0}
    <div class="filter-chips">
      {#each identifierFilters as filter}
        <button class="filter-chip" onclick={() => removeIdentifierFilter(filter)}>
          <span class="chip-label">ID:</span>{filter}
          <svg class="chip-x" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
        </button>
      {/each}
    </div>
  {/if}

  <div class="items" id="items-container">
    {#each filteredItems as item (item.id)}
      <StreamItem
        {item}
        metadata={getMetadata?.(item)}
        prettyPrint={prettyPrintEnabled}
        {getItemColor}
        {renderItemHeader}
        onCopy={copyToClipboard}
        onIdentifierClick={addIdentifierFilter}
      />
    {/each}
  </div>
</div>

<style>
  .stream-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
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
    gap: 1rem;
  }

  .left-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .right-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
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
    color: #fff;
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
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .pretty-print-toggle svg {
    width: 14px;
    height: 14px;
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
    color: #fff;
  }

  .copy-all-btn {
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

  .copy-all-btn svg {
    width: 14px;
    height: 14px;
  }

  .copy-all-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .copy-all-btn:focus {
    outline: none;
  }

  .copy-all-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--accent-emphasis);
  }

  .copy-all-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .copy-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .copy-all-btn.copied {
    background: var(--green);
    color: #fff;
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

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: var(--indigo);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s;
  }

  .filter-chip:hover {
    background: var(--indigo-light);
  }

  .chip-label {
    margin-right: 0.25rem;
  }

  .chip-x {
    width: 14px;
    height: 14px;
  }
</style>
