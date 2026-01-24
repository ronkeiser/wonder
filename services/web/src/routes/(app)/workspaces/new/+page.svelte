<script lang="ts">
  import type { ActionData } from './$types';
  import { createWorkspaceSchema } from './schema';
  import { createFormState } from '@wonder/forms';
  import TextInput from '$lib/components/TextInput.svelte';
  import Button from '$lib/components/Button.svelte';

  let { form }: { form: ActionData } = $props();

  let { formValues, errors, enhance, submitting } = $derived(
    createFormState(createWorkspaceSchema, form),
  );
</script>

<svelte:head>
  <title>New Workspace</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">New Workspace</h1>

  <form method="POST" class="space-y-4" novalidate use:enhance>
    <TextInput name="name" label="Name" value={formValues} error={errors} />
    <Button type="submit" disabled={$submitting}>
      {$submitting ? 'Creating...' : 'Create Workspace'}
    </Button>
  </form>
</div>
