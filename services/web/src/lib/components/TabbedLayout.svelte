<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    href: string;
  }

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    children: any;
  }

  let { tabs, activeTabId, children }: Props = $props();
</script>

<div class="flex flex-col h-screen bg-surface text-foreground">
  <div class="flex justify-between items-center h-14 px-4 bg-surface-raised border-b border-border">
    <div class="flex gap-2 h-full">
      {#each tabs as tab}
        <a
          href={tab.href}
          class="flex items-end px-4 pb-4 bg-transparent border-b-2 text-foreground-muted cursor-pointer text-base font-medium no-underline transition-colors duration-200 hover:text-foreground {tab.id === activeTabId ? 'text-foreground border-accent' : 'border-transparent'}"
        >
          {tab.label}
        </a>
      {/each}
    </div>
    <div class="flex items-center h-full">
      <form method="POST" action="/auth/logout">
        <button
          type="submit"
          class="py-1 px-3 bg-transparent border border-border text-foreground-muted cursor-pointer text-xs rounded transition-all duration-200 hover:bg-surface-overlay hover:text-foreground hover:border-gray"
        >
          Log Out
        </button>
      </form>
    </div>
  </div>
  <div class="flex-1 overflow-hidden">
    {@render children()}
  </div>
</div>
