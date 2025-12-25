<script lang="ts">
  import { Sidebar, createPersisted } from '@wonder/components';
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';
  import { page } from '$app/stores';

  let { children } = $props();

  const sidebarCollapsed = createPersisted('sidebar-collapsed', false, { cookie: true });

  const tabs = [
    { id: 'events', label: 'Events', href: '/events' },
    { id: 'trace', label: 'Trace', href: '/trace' },
    { id: 'logs', label: 'Logs', href: '/logs' },
  ];

  const activeTabId = $derived.by(() => {
    const path = $page.url.pathname;
    if (path.startsWith('/events')) return 'events';
    if (path.startsWith('/trace')) return 'trace';
    if (path.startsWith('/logs')) return 'logs';
    return 'events';
  });
</script>

<div class="flex h-screen">
  <Sidebar bind:collapsed={sidebarCollapsed.value} class="sidebar">
    {#snippet trigger(props, collapsed)}
      <button
        {...props}
        class="p-2 hover:bg-surface-hover rounded transition-colors"
      >
        <svg
          class="w-5 h-5 text-foreground-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {#if collapsed}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          {/if}
        </svg>
      </button>
    {/snippet}

    {#snippet children(collapsed)}
      <nav class="flex flex-col gap-1 mt-4">
        <a
          href="/events"
          class="flex items-center gap-3 px-2 py-2 rounded hover:bg-surface-hover transition-colors text-foreground-muted hover:text-foreground"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          {#if !collapsed}<span>Admin</span>{/if}
        </a>
      </nav>
    {/snippet}
  </Sidebar>

  <div class="flex-1 overflow-hidden">
    <TabbedLayout {tabs} {activeTabId}>
      {@render children()}
    </TabbedLayout>
  </div>
</div>

<style>
  :global(.sidebar) {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width, 200px);
    height: 100%;
    padding: 0.75rem;
    background: var(--color-surface-raised);
    border-right: 1px solid var(--color-border);
    transition: width 200ms ease;
  }

  :global(.sidebar[data-collapsed]) {
    width: var(--sidebar-collapsed-width, 56px);
  }
</style>
