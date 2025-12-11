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

<div class="tabbed-layout">
  <div class="tabs">
    {#each tabs as tab}
      <a href={tab.href} class="tab" class:active={tab.id === activeTabId}>
        {tab.label}
      </a>
    {/each}
  </div>
  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  .tabbed-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    padding-bottom: 0;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .tab {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1rem;
    font-family: inherit;
    font-weight: 500;
    text-decoration: none;
    transition:
      color 0.2s,
      border-color 0.2s;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--accent);
  }

  .content {
    flex: 1;
    overflow: hidden;
  }
</style>
