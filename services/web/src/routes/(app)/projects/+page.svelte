<script lang="ts">
  import type { PageData } from './$types';
  import Button from '$lib/components/Button.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Projects</title>
</svelte:head>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-semibold">Projects</h1>
    <Button href="/projects/new">New Project</Button>
  </div>

  {#if data.projects.length === 0}
    <p class="text-foreground-muted text-sm">No projects in this workspace</p>
  {:else}
    <div class="grid gap-4">
      {#each data.projects as project}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <a href="/projects/{project.id}" class="text-sm font-medium text-link hover:underline">{project.name}</a>
          {#if project.description}
            <p class="text-xs text-foreground-muted mt-1">{project.description}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
