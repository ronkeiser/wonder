<script lang="ts">
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';
  import { page } from '$app/state';

  let { children } = $props();

  const tabs = [
    { label: 'Events', href: '/admin/events' },
    { label: 'Trace', href: '/admin/trace' },
    { label: 'Logs', href: '/admin/logs' },
  ];
</script>

<TabbedLayout {tabs} activeHref={page.url.pathname}>
  {@render children()}
</TabbedLayout>
