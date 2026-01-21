import { formError, validateFormData } from '@wonder/forms';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAgentSchema } from './schema';

interface Project {
  id: string;
  name: string;
}

interface Persona {
  id: string;
  name: string;
}

export const load: PageServerLoad = async ({ fetch, locals }) => {
  const workspaceId = locals.workspaceId;

  const [projectsRes, personasRes] = await Promise.all([
    fetch(`/api/workspaces/${workspaceId}/projects?limit=100`),
    fetch('/api/personas?limit=100'),
  ]);

  const projects: Project[] = projectsRes.ok ? (await projectsRes.json()).projects : [];
  const personas: Persona[] = personasRes.ok ? (await personasRes.json()).personas : [];

  return { projects, personas };
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const formData = await request.formData();

    const result = validateFormData(formData, createAgentSchema);

    if (!result.success) {
      return formError(result.errors, result.data);
    }

    const projectIds = result.data.projectIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (projectIds.length === 0) {
      return formError({ projectIds: 'At least one project is required' }, result.data);
    }

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: result.data.name,
        projectIds,
        personaId: result.data.personaId || undefined,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      return formError({ name: error.error ?? 'Failed to create agent' }, result.data);
    }

    redirect(302, '/agents');
  },
};
