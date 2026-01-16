<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Agent {data.agent.id}</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Agent</h1>

  <dl class="grid gap-4 text-sm">
    <div>
      <dt class="text-foreground-subtle text-xs">ID</dt>
      <dd class="font-mono">{data.agent.id}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Projects</dt>
      <dd>
        <ul class="mt-1 space-y-1">
          {#each data.agent.projectIds as projectId}
            <li>
              <a href="/projects/{projectId}" class="font-mono text-xs text-link hover:underline">
                {projectId}
              </a>
            </li>
          {/each}
        </ul>
      </dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Persona</dt>
      <dd class="font-mono">{data.agent.personaId ?? 'None'}</dd>
    </div>
    {#if data.agent.personaVersion}
      <div>
        <dt class="text-foreground-subtle text-xs">Persona Version</dt>
        <dd>{data.agent.personaVersion}</dd>
      </div>
    {/if}
    <div>
      <dt class="text-foreground-subtle text-xs">Created</dt>
      <dd>{new Date(data.agent.createdAt).toLocaleString()}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Updated</dt>
      <dd>{new Date(data.agent.updatedAt).toLocaleString()}</dd>
    </div>
  </dl>
</div>
