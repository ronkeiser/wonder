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
    <div class="tabs-left">
      {#each tabs as tab}
        <a href={tab.href} class="tab" class:active={tab.id === activeTabId}>
          {tab.label}
        </a>
      {/each}
    </div>
    <div class="tabs-right">
      <form method="POST" action="/auth/logout">
        <button type="submit" class="logout-btn">Log Out</button>
      </form>
    </div>
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
    justify-content: space-between;
    align-items: center;
    height: 3.5rem;
    padding: 0 1rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .tabs-left {
    display: flex;
    gap: 0.5rem;
    height: 100%;
  }

  .tabs-right {
    display: flex;
    align-items: center;
    height: 100%;
  }

  .tab {
    display: flex;
    align-items: flex-end;
    padding: 0 1rem 1rem;
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

  .logout-btn {
    padding: 0.25rem 0.75rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    font-family: inherit;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .logout-btn:hover {
    background: var(--gray-dark);
    color: var(--text-primary);
    border-color: var(--gray);
  }

  .content {
    flex: 1;
    overflow: hidden;
  }
</style>
