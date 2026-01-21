<script lang="ts">
  import type { PageData } from './$types';
  import Button from '$lib/components/Button.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Agents</title>
</svelte:head>

<div class="p-6">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-semibold">Agents</h1>
    <Button href="/agents/new">New</Button>
  </div>

  {#if data.agents.length === 0}
    <p class="text-foreground-muted text-sm">No agents yet.</p>
  {:else}
    <div class="grid gap-4">
      {#each data.agents as agent}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <div class="flex items-center justify-between">
            <a href="/agents/{agent.id}" class="text-sm font-medium text-link hover:underline">
              {agent.name}
            </a>
            <span class="text-xs text-foreground-muted font-mono">{agent.id}</span>
          </div>
          <p class="text-xs text-foreground-muted mt-1">
            {agent.projectIds.length} project{agent.projectIds.length !== 1 ? 's' : ''}
          </p>
          {#if agent.personaName}
            <p class="text-xs text-foreground-muted mt-1">
              Persona: {agent.personaName}
            </p>
          {/if}
          <p class="text-xs text-foreground-muted mt-1">
            Created {new Date(agent.createdAt).toLocaleString()}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
