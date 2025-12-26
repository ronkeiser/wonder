<script lang="ts">
  import type { ActionData } from './$types';
  import { supportRequestSchema } from './schema';
  import { createFormState } from '@wonder/forms';
  import TextInput from '$lib/components/TextInput.svelte';
  import TextArea from '$lib/components/TextArea.svelte';
  import Button from '$lib/components/Button.svelte';

  let { form }: { form: ActionData } = $props();

  let { formValues, errors, enhance, submitting, success } = $derived(
    createFormState(supportRequestSchema, form),
  );
</script>

<div class="max-w-2xl mx-auto p-8">
  <h1 class="text-3xl font-bold mb-6">Support Request</h1>

  {#if success}
    <div class="mb-6 p-4 bg-green-50 border border-green-200 rounded-md text-green-800">
      ✓ Your support request has been submitted successfully!
    </div>
  {/if}

  <form method="POST" class="space-y-4" novalidate use:enhance>
    <TextInput name="name" label="Name" value={formValues} error={errors} />
    <TextInput name="email" label="Email" type="email" value={formValues} error={errors} />
    <TextInput name="subject" label="Subject" value={formValues} error={errors} />
    <TextArea name="message" label="Message" rows={6} value={formValues} error={errors} />
    <Button type="submit" disabled={$submitting}>
      {$submitting ? 'Submitting...' : 'Submit Request'}
    </Button>
  </form>
</div>
