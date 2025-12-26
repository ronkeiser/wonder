<script lang="ts">
  import type { ActionData } from './$types';
  import { createProjectSchema } from './schema';
  import { createFormState } from '@wonder/forms';
  import TextInput from '$lib/components/TextInput.svelte';
  import TextArea from '$lib/components/TextArea.svelte';
  import Button from '$lib/components/Button.svelte';

  let { form }: { form: ActionData } = $props();

  let { formValues, errors, enhance, submitting } = $derived(
    createFormState(createProjectSchema, form),
  );
</script>

<svelte:head>
  <title>New Project</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">New Project</h1>

  <form method="POST" class="space-y-4" novalidate use:enhance>
    <TextInput name="name" label="Name" value={formValues} error={errors} />
    <TextArea name="description" label="Description" rows={4} value={formValues} error={errors} />
    <Button type="submit" disabled={$submitting}>
      {$submitting ? 'Creating...' : 'Create Project'}
    </Button>
  </form>
</div>
