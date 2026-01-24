<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import Button from '$lib/components/Button.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Select Workspace</title>
</svelte:head>

<div class="p-8 h-full overflow-y-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-3xl font-bold">Workspaces</h1>
    <Button href="/workspaces/new">New Workspace</Button>
  </div>

  {#if form?.error}
    <div class="py-2 px-3 bg-error/10 text-error border-l-2 border-error mb-4 text-sm">
      {form.error}
    </div>
  {/if}

  {#if data.workspaces.length === 0}
    <p class="text-foreground-muted">No workspaces yet. Create one to get started.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each data.workspaces as workspace}
        <form method="POST" action="?/select">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <button
            type="submit"
            class="w-full py-3 px-4 bg-surface-overlay text-foreground rounded-md text-sm cursor-pointer transition-colors hover:bg-surface-hover text-left"
          >
            {workspace.name}
          </button>
        </form>
      {/each}
    </div>
  {/if}
</div>
