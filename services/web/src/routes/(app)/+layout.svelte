<script lang="ts">
  import { Sidebar, createPersisted } from '@wonder/components';
  import { Icon, type IconName } from '@wonder/icons';
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';
  import { page } from '$app/stores';

  let { children } = $props();

  const sidebarCollapsed = createPersisted('sidebar-collapsed', false, { cookie: true });

  const navItems: { href: string; label: string; icon: IconName }[] = [
    { href: '/admin', label: 'Admin', icon: 'clipboard' },
  ];

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
  <Sidebar
    bind:collapsed={sidebarCollapsed.value}
    class="group flex flex-col w-52 data-collapsed:w-15 h-full p-3 bg-surface-raised border-r border-border transition-[width] duration-200"
  >
    {#snippet trigger(props, collapsed)}
      <button
        {...props}
        class="flex items-center justify-center size-9 hover:bg-surface-hover rounded transition-colors cursor-pointer"
      >
        <Icon name="sidebar" size={20} class="text-foreground-muted" />
      </button>
    {/snippet}

    {#snippet children(collapsed)}
      <nav class="flex flex-col gap-1 mt-4">
        {#each navItems as item}
          <a
            href={item.href}
            class="flex items-center gap-3 px-2 h-9 rounded hover:bg-surface-hover transition-colors text-foreground-muted hover:text-foreground text-sm"
          >
            <Icon name={item.icon} size={20} class="shrink-0" />
            <span class="group-data-collapsed:hidden">{item.label}</span>
          </a>
        {/each}
      </nav>
    {/snippet}
  </Sidebar>

  <div class="flex-1 overflow-hidden">
    <TabbedLayout {tabs} {activeTabId}>
      {@render children()}
    </TabbedLayout>
  </div>
</div>
