<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { pushState } from '$app/navigation';
  import StreamItem from './StreamItem.svelte';

  interface FilterConfig {
    label: string;
    param: string;
    options: Array<{ value: string; label: string }>;
  }

  interface Props {
    title: string;
    apiPath: string;
    filterLabel: string;
    filterParam: string;
    filterOptions: Array<{ value: string; label: string }>;
    secondaryFilter?: FilterConfig; // Optional second filter (e.g., log level)
    itemsKey: string; // e.g., 'events' or 'logs'
    itemKey: string; // e.g., 'event' or 'log'
    streamPath?: string; // For global streams (e.g., '/logs/stream') - connects immediately
    subscribeMessage?: object; // Optional WebSocket subscription message
    workflowRunId?: string | null; // For per-resource streams - requires selection first
    defaultTimeFilter?: number | null; // Default time filter in minutes (used when no URL param)
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
    filterLabel,
    filterParam,
    filterOptions,
    secondaryFilter,
    itemsKey,
    itemKey,
    streamPath,
    subscribeMessage,
    workflowRunId = null,
    defaultTimeFilter = null,
    getItemColor,
    getMetadata,
    renderItemHeader,
  }: Props = $props();

  // Global stream mode: streamPath is provided, connect immediately without needing workflowRunId
  const isGlobalStream = $derived(!!streamPath);

  let items = $state<any[]>([]);
  let status = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
  let currentFilter = $state('');
  let secondaryFilterValue = $state('');
  let timeFilterMinutes = $state<number | null>(null);
  let prettyPrintEnabled = $state(false);
  let identifierFilters = $state<string[]>([]);
  let ws: WebSocket | null = null;
  let seenIds = new Set<string>();
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  function getColor(item: any): string {
    if (getItemColor) {
      return getItemColor(item);
    }
    return 'var(--color-gray)';
  }

  async function filterItemsByTime(minutes: number | null) {
    items = [];
    seenIds.clear();
    timeFilterMinutes = minutes;

    // If no time filter, use a very large window (all time)
    const cutoffTime = minutes ? Date.now() - minutes * 60 * 1000 : 0;

    try {
      const url = new URL(apiPath, window.location.origin);
      url.searchParams.set('limit', '1000');
      if (currentFilter) {
        url.searchParams.set(filterParam, currentFilter);
      }
      if (secondaryFilter && secondaryFilterValue) {
        url.searchParams.set(secondaryFilter.param, secondaryFilterValue);
      }
      if (workflowRunId) {
        // Use rootRunId to include subworkflow events in the stream
        url.searchParams.set('rootRunId', workflowRunId);
      }

      const response = await fetch(url);
      const data = await response.json();

      // Handle both array response and object response
      const rawItems = Array.isArray(data) ? data : data[itemsKey];

      const filtered = rawItems
        .filter((item: any) => item.timestamp >= cutoffTime)
        .sort((a: any, b: any) => {
          // Sort newest first (descending)
          if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
          // Sort by sequence for tie-breaking (descending)
          if (a.sequence !== undefined && b.sequence !== undefined) {
            return b.sequence - a.sequence;
          }
          return 0;
        });

      items = filtered;
      filtered.forEach((item: any) => seenIds.add(item.id));
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

    // Check if item matches secondary filter
    if (secondaryFilter && secondaryFilterValue) {
      const itemSecondaryValue = item[secondaryFilter.param];
      if (itemSecondaryValue !== secondaryFilterValue) return;
    }

    // Insert in sorted order (newest first - descending)
    const insertIndex = items.findIndex((existingItem) => {
      if (existingItem.timestamp !== item.timestamp) {
        return existingItem.timestamp < item.timestamp;
      }
      // Sort by sequence for tie-breaking (descending)
      if (existingItem.sequence !== undefined && item.sequence !== undefined) {
        return existingItem.sequence < item.sequence;
      }
      return false;
    });

    if (insertIndex === -1) {
      items = [...items, item];
    } else {
      items = [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)];
    }

    // Keep only first 1000 entries (newest)
    if (items.length > 1000) {
      items = items.slice(0, 1000);
    }

    // Trim seenIds set
    if (seenIds.size > 2000) {
      const idsArray = Array.from(seenIds);
      seenIds.clear();
      idsArray.slice(-1000).forEach((id) => seenIds.add(id));
    }
  }

  function disconnect() {
    // Cancel any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Mark as intentional so onclose doesn't auto-reconnect
    intentionalClose = true;

    if (ws) {
      ws.close();
      ws = null;
    }

    status = 'disconnected';
  }

  function connect() {
    // Determine WebSocket URL based on streaming mode
    let wsUrl: string;
    let connectionId: string;

    if (streamPath) {
      // Global stream mode: connect directly to the stream path
      wsUrl = `wss://api.wflow.app${streamPath}`;
      connectionId = 'global';
    } else if (workflowRunId) {
      // Per-resource stream mode: connect to workflow-specific stream
      wsUrl = `wss://api.wflow.app/workflow-runs/${workflowRunId}/stream`;
      connectionId = workflowRunId;
    } else {
      // No stream path and no workflow run selected - can't connect
      status = 'disconnected';
      return;
    }

    // Clean up any existing connection first
    if (ws) {
      intentionalClose = true;
      ws.close();
      ws = null;
    }

    // Cancel any pending reconnect from previous connection
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Reset intentional close flag for new connection
    intentionalClose = false;
    status = 'connecting';

    const socket = new WebSocket(wsUrl);
    ws = socket;

    socket.onopen = () => {
      // Check if this socket is still current
      if (ws !== socket) return;

      status = 'connected';
      console.log('WebSocket connected to', connectionId);

      if (subscribeMessage && workflowRunId) {
        // Build subscription message with rootRunId filter to include subworkflow events
        const message = { ...subscribeMessage } as any;
        message.filters = { ...message.filters, rootRunId: workflowRunId };
        socket.send(JSON.stringify(message));
      }
    };

    socket.onmessage = (message) => {
      // Check if this socket is still current
      if (ws !== socket) return;

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

    socket.onerror = (error) => {
      // Check if this socket is still current
      if (ws !== socket) return;

      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      // Check if this socket is still current
      if (ws !== socket) return;

      status = 'disconnected';

      // Only auto-reconnect if this wasn't an intentional close
      if (!intentionalClose) {
        console.log('WebSocket closed unexpectedly, reconnecting in 3s...');
        reconnectTimeout = setTimeout(() => {
          // For global streams, always reconnect
          // For per-resource streams, only if still viewing same resource
          if (streamPath || workflowRunId === connectionId) {
            connect();
          }
        }, 3000);
      } else {
        console.log('WebSocket closed intentionally');
      }
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

  // Track previous workflowRunId to detect changes
  let prevWorkflowRunId = $state<string | null | undefined>(undefined);

  // Reconnect when workflowRunId changes
  $effect(() => {
    // Skip initial render (prevWorkflowRunId is undefined)
    if (prevWorkflowRunId === undefined) {
      prevWorkflowRunId = workflowRunId;
      return;
    }

    // If workflowRunId changed, reconnect
    if (workflowRunId !== prevWorkflowRunId) {
      prevWorkflowRunId = workflowRunId;

      // Clean up existing connection properly
      disconnect();

      // Clear existing items
      items = [];
      seenIds.clear();

      // Reset time filter when switching workflow runs
      timeFilterMinutes = null;

      // Fetch and connect
      filterItemsByTime(null);
      connect();
    }
  });

  onMount(() => {
    // Load filters from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const savedMinutes = urlParams.get('m');
    const savedFilter = urlParams.get(filterParam);
    const savedSecondaryFilter = secondaryFilter ? urlParams.get(secondaryFilter.param) : null;
    const savedPretty = urlParams.get('pretty');

    // Use saved value from URL, or fall back to default
    timeFilterMinutes = savedMinutes ? parseInt(savedMinutes) : defaultTimeFilter;
    if (savedFilter) currentFilter = savedFilter;
    if (savedSecondaryFilter) secondaryFilterValue = savedSecondaryFilter;
    if (savedPretty === '1') prettyPrintEnabled = true;

    // Only fetch on mount if we have a workflowRunId or it's a global stream
    // Otherwise wait for a workflow to be selected
    if (workflowRunId || isGlobalStream) {
      filterItemsByTime(timeFilterMinutes);
      connect();
    }
  });

  onDestroy(() => {
    disconnect();
  });

  function handleFilterChange(value: string) {
    currentFilter = value;

    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(filterParam, value);
    } else {
      url.searchParams.delete(filterParam);
    }
    pushState(url, {});

    filterItemsByTime(timeFilterMinutes);
  }

  function handleSecondaryFilterChange(value: string) {
    if (!secondaryFilter) return;

    secondaryFilterValue = value;

    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(secondaryFilter.param, value);
    } else {
      url.searchParams.delete(secondaryFilter.param);
    }
    pushState(url, {});

    filterItemsByTime(timeFilterMinutes);
  }

  function handleTimeFilterChange(minutes: number) {
    // If clicking the already-selected filter, remove it (toggle off)
    const newValue = timeFilterMinutes === minutes ? null : minutes;

    const url = new URL(window.location.href);
    if (newValue) {
      url.searchParams.set('m', newValue.toString());
    } else {
      url.searchParams.delete('m');
    }
    pushState(url, {});

    filterItemsByTime(newValue);
  }

  function togglePrettyPrint() {
    prettyPrintEnabled = !prettyPrintEnabled;

    const url = new URL(window.location.href);
    if (prettyPrintEnabled) {
      url.searchParams.set('pretty', '1');
    } else {
      url.searchParams.delete('pretty');
    }
    pushState(url, {});
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

<div class="stream-viewer flex flex-col h-full bg-surface text-foreground">
  {#if isGlobalStream || workflowRunId || !subscribeMessage}
    <header class="h-16 bg-surface-raised px-4 pl-2.5 border-b border-border flex justify-between items-center gap-4 box-border">
      <div class="flex gap-4 items-center">
        <select
          class="py-1.5 px-3 pr-8 bg-surface-overlay bg-no-repeat bg-position-[right_0.5rem_center] bg-size-[16px] appearance-none border-none rounded-md text-foreground cursor-pointer text-sm transition-colors duration-100 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
          style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23c9d1d9'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E&quot;)"
          bind:value={currentFilter}
          onchange={(e) => handleFilterChange(e.currentTarget.value)}
        >
          <option value="">All {filterLabel}</option>
          {#each filterOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {#if secondaryFilter}
          <select
            class="py-1.5 px-3 pr-8 bg-surface-overlay bg-no-repeat bg-position-[right_0.5rem_center] bg-size-[16px] appearance-none border-none rounded-md text-foreground cursor-pointer text-sm transition-colors duration-100 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
            style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23c9d1d9'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E&quot;)"
            bind:value={secondaryFilterValue}
            onchange={(e) => handleSecondaryFilterChange(e.currentTarget.value)}
          >
            <option value="">All {secondaryFilter.label}</option>
            {#each secondaryFilter.options as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/if}
        {#if isGlobalStream || (subscribeMessage && workflowRunId)}
          <span class="inline-block py-1 px-2 rounded text-xs font-medium leading-normal {status === 'connected' ? 'bg-success text-white' : ''} {status === 'disconnected' ? 'bg-error text-white' : ''} {status === 'connecting' ? 'bg-warning text-white' : ''}">{status}</span>
        {/if}
      </div>
      <div class="flex gap-4 items-center flex-wrap">
        <div class="flex gap-2">
          {#each [1, 5, 15, 60, 1440] as minutes}
            <button
              class="py-1.5 px-3 border-none rounded-md cursor-pointer text-sm transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted {timeFilterMinutes === minutes ? 'bg-accent text-white' : 'bg-surface-overlay text-foreground hover:bg-surface-hover'}"
              onclick={() => handleTimeFilterChange(minutes)}
            >
              {minutes < 60 ? `${minutes}m` : minutes === 60 ? '1h' : '24h'}
            </button>
          {/each}
        </div>

        <button
          class="py-1.5 px-3 border-none rounded-md cursor-pointer text-sm transition-colors duration-100 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted {prettyPrintEnabled ? 'bg-accent text-white' : 'bg-surface-overlay text-foreground hover:bg-surface-hover'}"
          onclick={togglePrettyPrint}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
            <path
              d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm.75 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"
            ></path>
          </svg>
          Pretty
        </button>

        <button
          class="py-1.5 px-3 bg-surface-overlay border-none rounded-md text-foreground cursor-pointer text-sm flex items-center gap-1.5 transition-all duration-100 hover:enabled:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted active:enabled:scale-95 disabled:opacity-50 disabled:cursor-not-allowed {copyAllStatus === 'copied' ? 'bg-success text-white' : ''}"
          onclick={copyAllToClipboard}
          disabled={filteredItems.length === 0}
        >
          {#if copyAllStatus === 'copied'}
            <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
              <path
                d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
              ></path>
            </svg>
            Copied!
          {:else}
            <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
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

        <button
          class="py-1.5 px-3 bg-surface-overlay border-none rounded-md text-foreground cursor-pointer text-sm flex items-center gap-1.5 transition-all duration-100 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted active:scale-95"
          onclick={() => filterItemsByTime(timeFilterMinutes)}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
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
      <div class="flex flex-wrap gap-2 py-3 px-4 bg-surface-raised border-b border-border">
        {#each identifierFilters as filter}
          <button
            class="inline-flex items-center gap-1.5 py-1 px-2 bg-indigo text-white border-none rounded text-[0.8rem] font-medium cursor-pointer transition-colors duration-100 hover:bg-indigo-light"
            onclick={() => removeIdentifierFilter(filter)}
          >
            <span class="mr-1">ID:</span>{filter}
            <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
            </svg>
          </button>
        {/each}
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-4 pl-2.5" id="items-container">
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
  {:else}
    <header class="h-16 bg-surface-raised border-b border-border"></header>
    <div class="flex items-center justify-center flex-1 text-foreground-muted text-sm">
      <p class="m-0">Select a workflow run to view events</p>
    </div>
  {/if}
</div>

<style>
  ::-webkit-scrollbar {
    width: 12px;
  }

  ::-webkit-scrollbar-track {
    background: var(--color-surface);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 6px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #484f58;
  }
</style>
