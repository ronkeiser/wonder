<script lang="ts">
  import { Sidebar, createPersisted } from '@wonder/components';
  import { Icon } from '@wonder/icons';
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
        {#if collapsed}
          <Icon name="list" size={20} class="text-foreground-muted" />
        {:else}
          <Icon name="x" size={20} class="text-foreground-muted" />
        {/if}
      </button>
    {/snippet}

    {#snippet children(collapsed)}
      <nav class="flex flex-col gap-1 mt-4">
        <a
          href="/events"
          class="flex items-center gap-3 px-2 py-2 rounded hover:bg-surface-hover transition-colors text-foreground-muted hover:text-foreground"
        >
          <Icon name="clipboard" size={20} class="shrink-0" />
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
