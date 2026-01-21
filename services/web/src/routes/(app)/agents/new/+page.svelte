<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { createAgentSchema } from './schema';
  import { createFormState } from '@wonder/forms';
  import TextInput from '$lib/components/TextInput.svelte';
  import Button from '$lib/components/Button.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let { formValues, errors, enhance, submitting } = $derived(createFormState(createAgentSchema, form));

  let selectedProjectIds = $state<string[]>([]);

  function toggleProject(projectId: string) {
    if (selectedProjectIds.includes(projectId)) {
      selectedProjectIds = selectedProjectIds.filter((id) => id !== projectId);
    } else {
      selectedProjectIds = [...selectedProjectIds, projectId];
    }
  }
</script>

<svelte:head>
  <title>New Agent</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">New Agent</h1>

  <form method="POST" class="space-y-4" novalidate use:enhance>
    <TextInput name="name" label="Name" value={formValues} error={errors} required />

    <div>
      <label class="block text-sm font-medium mb-2">Projects</label>
      <input type="hidden" name="projectIds" value={selectedProjectIds.join(',')} />
      {#if data.projects.length === 0}
        <p class="text-sm text-foreground-muted">No projects available. Create a project first.</p>
      {:else}
        <div class="space-y-2 max-h-48 overflow-y-auto border border-border rounded p-2">
          {#each data.projects as project}
            <label class="flex items-center gap-2 cursor-pointer hover:bg-surface-raised p-1 rounded">
              <input
                type="checkbox"
                checked={selectedProjectIds.includes(project.id)}
                onchange={() => toggleProject(project.id)}
                class="rounded"
              />
              <span class="text-sm">{project.name}</span>
              <span class="text-xs text-foreground-muted font-mono">({project.id})</span>
            </label>
          {/each}
        </div>
      {/if}
      {#if $errors?.['projectIds']}
        <p class="mt-1 text-sm text-red-600" role="alert">{$errors['projectIds']}</p>
      {/if}
    </div>

    <div>
      <label for="personaId" class="block text-sm font-medium mb-1">Persona (optional)</label>
      <select
        id="personaId"
        name="personaId"
        class="w-full px-3 py-2 border border-border rounded-md bg-surface-raised"
        value={$formValues['personaId'] ?? ''}
      >
        <option value="">No persona</option>
        {#each data.personas as persona}
          <option value={persona.id}>{persona.name}</option>
        {/each}
      </select>
      {#if $errors?.['personaId']}
        <p class="mt-1 text-sm text-red-600" role="alert">{$errors['personaId']}</p>
      {/if}
    </div>

    <div class="pt-4">
      <Button type="submit" disabled={$submitting}>
        {$submitting ? 'Creating...' : 'Create Agent'}
      </Button>
    </div>
  </form>
</div>
