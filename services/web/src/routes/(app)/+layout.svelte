<script lang="ts">
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';
  import { page } from '$app/stores';

  let { children } = $props();

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

<TabbedLayout {tabs} {activeTabId}>
  {@render children()}
</TabbedLayout>
