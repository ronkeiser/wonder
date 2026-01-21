<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { createPersonaSchema } from './schema';
  import { createFormState } from '@wonder/forms';
  import TextInput from '$lib/components/TextInput.svelte';
  import TextArea from '$lib/components/TextArea.svelte';
  import Button from '$lib/components/Button.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let { formValues, errors, enhance, submitting } = $derived(createFormState(createPersonaSchema, form));
</script>

<svelte:head>
  <title>New Persona</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">New Persona</h1>

  <form method="POST" class="space-y-4" novalidate use:enhance>
    <TextInput name="name" label="Name" value={formValues} error={errors} required />

    <TextArea name="description" label="Description" rows={2} value={formValues} error={errors} />

    <TextArea
      name="systemPrompt"
      label="System Prompt"
      rows={6}
      value={formValues}
      error={errors}
      required
    />

    <div>
      <label for="modelProfileId" class="block text-sm font-medium mb-1">Model Profile</label>
      <select
        id="modelProfileId"
        name="modelProfileId"
        required
        class="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
        value={$formValues['modelProfileId'] ?? ''}
      >
        <option value="">Select a model profile...</option>
        {#each data.modelProfiles as profile}
          <option value={profile.id}>{profile.name}</option>
        {/each}
      </select>
      {#if $errors?.['modelProfileId']}
        <p class="mt-1 text-sm text-red-600" role="alert">{$errors['modelProfileId']}</p>
      {/if}
    </div>

    <div>
      <label for="contextAssemblyWorkflowDefId" class="block text-sm font-medium mb-1"
        >Context Assembly Workflow Def</label
      >
      <select
        id="contextAssemblyWorkflowDefId"
        name="contextAssemblyWorkflowDefId"
        required
        class="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
        value={$formValues['contextAssemblyWorkflowDefId'] ?? ''}
      >
        <option value="">Select a workflow def...</option>
        {#each data.workflowDefs as workflow}
          <option value={workflow.id}>{workflow.name}</option>
        {/each}
      </select>
      {#if $errors?.['contextAssemblyWorkflowDefId']}
        <p class="mt-1 text-sm text-red-600" role="alert">{$errors['contextAssemblyWorkflowDefId']}</p>
      {/if}
    </div>

    <div>
      <label for="memoryExtractionWorkflowDefId" class="block text-sm font-medium mb-1"
        >Memory Extraction Workflow Def</label
      >
      <select
        id="memoryExtractionWorkflowDefId"
        name="memoryExtractionWorkflowDefId"
        required
        class="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
        value={$formValues['memoryExtractionWorkflowDefId'] ?? ''}
      >
        <option value="">Select a workflow def...</option>
        {#each data.workflowDefs as workflow}
          <option value={workflow.id}>{workflow.name}</option>
        {/each}
      </select>
      {#if $errors?.['memoryExtractionWorkflowDefId']}
        <p class="mt-1 text-sm text-red-600" role="alert">{$errors['memoryExtractionWorkflowDefId']}</p>
      {/if}
    </div>

    <TextInput
      name="recentTurnsLimit"
      label="Recent Turns Limit"
      type="text"
      value={formValues}
      error={errors}
    />

    <TextInput
      name="toolIds"
      label="Tool IDs (comma-separated)"
      value={formValues}
      error={errors}
    />

    <div class="pt-4">
      <Button type="submit" disabled={$submitting}>
        {$submitting ? 'Creating...' : 'Create Persona'}
      </Button>
    </div>
  </form>
</div>
