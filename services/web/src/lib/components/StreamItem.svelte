<script lang="ts">
  interface Props {
    item: any;
    prettyPrint: boolean;
    getItemColor?: (item: any) => string;
    renderItemHeader: (item: any) => {
      time: string;
      badge: { text: string; color: string };
      identifier?: string;
      message?: string;
    };
    onCopy: (item: any) => void;
  }

  let { item, prettyPrint, getItemColor, renderItemHeader, onCopy }: Props = $props();

  // Local override for individual toggle (null = use global default)
  let localPrettyPrint = $state<boolean | null>(null);

  function formatJsonPretty(obj: any) {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
      const unescaped = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return '"' + unescaped + '"';
    });
  }

  function getColor(): string {
    if (getItemColor) {
      return getItemColor(item);
    }
    return 'var(--gray)';
  }

  const header = $derived(renderItemHeader(item));

  // Use local override if set, otherwise use global prettyPrint
  const effectivePrettyPrint = $derived(localPrettyPrint !== null ? localPrettyPrint : prettyPrint);

  const formattedMetadata = $derived.by(() => {
    if (!item.metadata || item.metadata === '{}') return null;

    try {
      const parsed = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;

      if (Object.keys(parsed).length === 0) return null;

      return effectivePrettyPrint ? formatJsonPretty(parsed) : JSON.stringify(parsed);
    } catch (e) {
      return item.metadata;
    }
  });

  function toggleLocalPrettyPrint(event: MouseEvent) {
    event.stopPropagation();
    // Toggle from current effective state
    localPrettyPrint = !effectivePrettyPrint;
  }
</script>

<div class="item-entry" style="border-left-color: {getColor()}">
  <div class="item-header">
    <span class="item-time">{header.time}</span>
    <span class="item-badge" style="background-color: {header.badge.color}">
      {header.badge.text}
    </span>
    {#if header.identifier}
      <span class="item-identifier">[{header.identifier}]</span>
    {/if}
    {#if header.message}
      <span class="item-message">{header.message}</span>
    {/if}
  </div>
  {#if formattedMetadata}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <pre class="item-metadata json-data" onclick={toggleLocalPrettyPrint}>{formattedMetadata}</pre>
  {/if}
  <button class="copy-btn" onclick={() => onCopy(item)} title="Copy to clipboard">
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

<style>
  .item-entry {
    padding: 0.5rem;
    margin-bottom: 0.25rem;
    border-left: 3px solid transparent;
    font-size: 0.875rem;
    line-height: 1.5;
    position: relative;
  }

  .item-entry:hover {
    background: var(--bg-secondary);
  }

  .item-entry:hover .copy-btn {
    opacity: 1;
  }

  .item-header {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    flex-wrap: wrap;
    padding-right: 2rem; /* Space for copy button */
  }

  .item-time {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .item-badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #000;
  }

  .item-identifier {
    color: var(--text-link);
    font-size: 0.9rem;
  }

  .item-message {
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .item-metadata {
    margin-top: 0.25rem;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    cursor: pointer;
    transition: background 0.1s;
  }

  .item-metadata:hover {
    background: var(--bg-tertiary);
  }

  .copy-btn {
    opacity: 0;
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
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
</style>
