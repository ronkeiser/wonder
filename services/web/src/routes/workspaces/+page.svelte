<script lang="ts">
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Select Workspace</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-darkest">
  <div class="bg-transparent p-6 w-full max-w-[320px]">
    <h1 class="m-0 mb-6 text-center text-gray-lightest font-normal text-sm tracking-widest uppercase">
      Select Workspace
    </h1>

    {#if form?.error}
      <div class="py-2 px-2 bg-transparent text-error border-0 border-l-2 border-error rounded-none mb-3 text-left text-[0.625rem]">
        {form.error}
      </div>
    {/if}

    {#if data.workspaces.length === 0}
      <p class="text-gray-lighter text-xs text-center">No workspaces available</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each data.workspaces as workspace}
          <form method="POST" action="?/select">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <button
              type="submit"
              class="w-full py-3 px-4 bg-transparent text-gray-lightest border border-gray-dark rounded-none text-xs font-normal cursor-pointer uppercase tracking-wide transition-all duration-200 hover:border-accent hover:text-accent text-left"
            >
              {workspace.name}
            </button>
          </form>
        {/each}
      </div>
    {/if}
  </div>
</div>
