import { formError, validateFormData } from '@wonder/forms';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createPersonaSchema } from './schema';

interface ModelProfile {
  id: string;
  name: string;
}

interface WorkflowDef {
  id: string;
  name: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  // Fetch model profiles and workflow definitions for dropdowns
  const [modelProfilesRes, workflowDefsRes] = await Promise.all([
    fetch('/api/model-profiles?limit=100'),
    fetch('/api/workflow-defs?limit=100'),
  ]);

  const modelProfiles: ModelProfile[] = modelProfilesRes.ok
    ? (await modelProfilesRes.json()).modelProfiles
    : [];

  const workflowDefs: WorkflowDef[] = workflowDefsRes.ok ? (await workflowDefsRes.json()).workflowDefs : [];

  return { modelProfiles, workflowDefs };
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const formData = await request.formData();

    const result = validateFormData(formData, createPersonaSchema);

    if (!result.success) {
      return formError(result.errors, result.data);
    }

    // Parse toolIds from comma-separated string to array
    const toolIds = result.data.toolIds
      ? result.data.toolIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    const res = await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: result.data.name,
        description: result.data.description ?? '',
        systemPrompt: result.data.systemPrompt,
        modelProfileId: result.data.modelProfileId,
        contextAssemblyWorkflowId: result.data.contextAssemblyWorkflowId,
        memoryExtractionWorkflowId: result.data.memoryExtractionWorkflowId,
        recentTurnsLimit: result.data.recentTurnsLimit,
        toolIds,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      return formError({ name: error.error ?? 'Failed to create persona' }, result.data);
    }

    const data = await res.json();

    redirect(302, `/personas`);
  },
};
