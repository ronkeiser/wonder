<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Agents</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Agents</h1>

  {#if data.agents.length === 0}
    <p class="text-foreground-muted text-sm">No agents yet.</p>
  {:else}
    <div class="grid gap-4">
      {#each data.agents as agent}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <div class="flex items-center justify-between">
            <a href="/agents/{agent.id}" class="text-sm font-medium text-link hover:underline font-mono">
              {agent.id}
            </a>
          </div>
          <p class="text-xs text-foreground-muted mt-1">
            {agent.projectIds.length} project{agent.projectIds.length !== 1 ? 's' : ''}
          </p>
          {#if agent.personaId}
            <p class="text-xs text-foreground-muted mt-1">
              Persona: <span class="font-mono">{agent.personaId}</span>
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
