import type { PageServerLoad } from './$types';

interface Project {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch, locals }) => {
  const { workspaceId } = locals;

  if (!workspaceId) {
    return { projects: [] };
  }

  const res = await fetch(`/api/workspaces/${workspaceId}/projects`);
  if (!res.ok) {
    return { projects: [] };
  }

  const data = await res.json();
  return { projects: data.projects as Project[] };
};
