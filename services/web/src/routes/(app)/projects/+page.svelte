<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Projects</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Projects</h1>

  {#if data.projects.length === 0}
    <p class="text-foreground-muted text-sm">No projects in this workspace</p>
  {:else}
    <div class="grid gap-4">
      {#each data.projects as project}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <h2 class="text-sm font-medium">{project.name}</h2>
          <p class="text-xs text-foreground-muted mt-1 font-mono">{project.id}</p>
        </div>
      {/each}
    </div>
  {/if}
</div>
