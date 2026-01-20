<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Personas</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Personas</h1>

  {#if data.personas.length === 0}
    <p class="text-foreground-muted text-sm">No personas yet.</p>
  {:else}
    <div class="grid gap-4">
      {#each data.personas as persona}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm font-medium">{persona.name}</span>
              <span class="text-xs text-foreground-muted ml-2">v{persona.version}</span>
            </div>
            <span class="text-xs font-mono text-foreground-muted">{persona.id}</span>
          </div>
          {#if persona.description}
            <p class="text-xs text-foreground-muted mt-2">{persona.description}</p>
          {/if}
          <div class="flex gap-4 mt-2 text-xs text-foreground-muted">
            <span>{persona.toolIds.length} tool{persona.toolIds.length !== 1 ? 's' : ''}</span>
            <span>Recent turns: {persona.recentTurnsLimit}</span>
            {#if persona.constraints?.maxMovesPerTurn}
              <span>Max moves: {persona.constraints.maxMovesPerTurn}</span>
            {/if}
          </div>
          <p class="text-xs text-foreground-muted mt-2">
            Created {new Date(persona.createdAt).toLocaleString()}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
