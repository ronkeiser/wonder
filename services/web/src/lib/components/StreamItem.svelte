<script lang="ts">
  interface Props {
    item: any;
    metadata?: any;
    prettyPrint: boolean;
    getItemColor?: (item: any) => string;
    renderItemHeader: (item: any) => {
      time: string;
      badge: { text: string; color: string };
      identifier?: string;
      message?: string;
    };
    onCopy: (item: any) => void;
    onIdentifierClick?: (identifier: string) => void;
  }

  let { item, metadata, prettyPrint, getItemColor, renderItemHeader, onCopy, onIdentifierClick }: Props = $props();

  // Local override for individual toggle (null = use global default)
  let localPrettyPrint = $state<boolean | null>(null);
  let copied = $state(false);
  let showCheck = $state(false);
  let expanded = $state(false);

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
    return 'var(--color-gray-lighter)';
  }

  const header = $derived(renderItemHeader(item));

  // Use local override if set, otherwise use global prettyPrint
  const effectivePrettyPrint = $derived(localPrettyPrint !== null ? localPrettyPrint : prettyPrint);

  const formattedMetadata = $derived.by(() => {
    if (!metadata) return null;

    try {
      const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

      if (typeof parsed === 'object' && Object.keys(parsed).length === 0) return null;

      return effectivePrettyPrint ? formatJsonPretty(parsed) : JSON.stringify(parsed);
    } catch (e) {
      return typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    }
  });

  const formattedFullItem = $derived.by(() => {
    return effectivePrettyPrint ? formatJsonPretty(item) : JSON.stringify(item);
  });

  function toggleLocalPrettyPrint(event: MouseEvent) {
    event.stopPropagation();
    // Toggle from current effective state
    localPrettyPrint = !effectivePrettyPrint;
  }

  async function handleCopy() {
    onCopy(item);
    copied = true;
    showCheck = true;
    setTimeout(() => {
      copied = false;
      // Wait for opacity transition to complete before changing icon
      setTimeout(() => {
        showCheck = false;
      }, 200);
    }, 2000);
  }

  function handleIdentifierClick(event: MouseEvent) {
    event.stopPropagation();
    if (header.identifier && onIdentifierClick) {
      onIdentifierClick(header.identifier);
    }
  }

  function toggleExpanded(event: MouseEvent) {
    event.stopPropagation();
    expanded = !expanded;
    // Auto-enable pretty print when expanding to full JSON
    if (expanded) {
      localPrettyPrint = true;
    }
  }
</script>

<div
  class="py-3 px-2 mb-2 border-l-[3px] text-sm leading-relaxed relative group hover:bg-surface-raised"
  style="border-left-color: {getColor()}"
>
  <div class="flex gap-2 items-baseline flex-wrap pr-14">
    <span class="text-foreground-muted font-medium">{header.time}</span>
    <span
      class="inline-block py-0.5 px-1.5 rounded text-xs font-semibold text-black"
      style="background-color: {header.badge.color}"
    >
      {header.badge.text}
    </span>
    {#if header.identifier}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="text-blue-lighter text-[0.9rem] {onIdentifierClick ? 'cursor-pointer' : ''}"
        onclick={onIdentifierClick ? handleIdentifierClick : undefined}
      >[<span class={onIdentifierClick ? 'hover:underline' : ''}>{header.identifier}</span>]</span>
    {/if}
    {#if header.message}
      <span class="text-foreground text-[0.9rem]">{header.message}</span>
    {/if}
  </div>
  {#if expanded}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <pre
      class="mt-1 p-2 bg-surface-raised rounded text-foreground-muted text-xs overflow-x-auto whitespace-pre-wrap wrap-break-word cursor-pointer transition-colors duration-100 hover:bg-surface-overlay"
      onclick={toggleLocalPrettyPrint}>{formattedFullItem}</pre>
  {:else if formattedMetadata}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <pre
      class="mt-1 p-2 bg-surface-raised rounded text-foreground-muted text-xs overflow-x-auto whitespace-pre-wrap wrap-break-word cursor-pointer transition-colors duration-100 hover:bg-surface-overlay"
      onclick={toggleLocalPrettyPrint}>{formattedMetadata}</pre>
  {/if}
  <div class="opacity-0 absolute top-2 right-2 flex gap-1 transition-opacity duration-200 group-hover:opacity-100">
    <button
      class="p-1 bg-transparent border border-border rounded text-foreground-muted cursor-pointer transition-all duration-200 hover:bg-surface-overlay hover:text-foreground {expanded ? 'bg-surface-overlay text-foreground' : ''}"
      onclick={toggleExpanded}
      title={expanded ? 'Fold' : 'Unfold full JSON'}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 block">
        {#if expanded}
          <!-- Fold icon (arrows pointing inward) -->
          <path d="M10.896 2H8.75V.75a.75.75 0 0 0-1.5 0V2H5.104a.25.25 0 0 0-.177.427l2.896 2.896a.25.25 0 0 0 .354 0l2.896-2.896A.25.25 0 0 0 10.896 2ZM8.75 15.25a.75.75 0 0 1-1.5 0V14H5.104a.25.25 0 0 1-.177-.427l2.896-2.896a.25.25 0 0 1 .354 0l2.896 2.896a.25.25 0 0 1-.177.427H8.75v1.25ZM2.25 5.25a.75.75 0 0 0 0 1.5h11.5a.75.75 0 0 0 0-1.5H2.25ZM2.25 9.25a.75.75 0 0 0 0 1.5h11.5a.75.75 0 0 0 0-1.5H2.25Z"></path>
        {:else}
          <!-- Unfold icon (arrows pointing outward) -->
          <path d="M8.177.677a.25.25 0 0 1 .354 0l2.896 2.896a.25.25 0 0 1-.177.427H8.75v1.25a.75.75 0 0 1-1.5 0V4H5.104a.25.25 0 0 1-.177-.427L7.823.677ZM7.25 10.75a.75.75 0 0 1 1.5 0V12h2.146a.25.25 0 0 1 .177.427l-2.896 2.896a.25.25 0 0 1-.354 0l-2.896-2.896A.25.25 0 0 1 5.104 12H7.25v-1.25ZM2.25 6.75a.75.75 0 0 0 0 1.5h11.5a.75.75 0 0 0 0-1.5H2.25Z"></path>
        {/if}
      </svg>
    </button>
    <button
      class="p-1 bg-transparent border border-border rounded text-foreground-muted cursor-pointer transition-all duration-200 hover:bg-surface-overlay hover:text-foreground {copied ? 'bg-surface-overlay text-foreground' : ''}"
      onclick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 block">
        {#if showCheck}
          <path
            d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
          ></path>
        {:else}
          <path
            d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
          ></path>
          <path
            d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
          ></path>
        {/if}
      </svg>
    </button>
  </div>
</div>
