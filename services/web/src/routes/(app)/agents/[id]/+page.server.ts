import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface Agent {
  id: string;
  projectIds: string[];
  personaId: string | null;
  personaVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch, params }) => {
  const res = await fetch(`/api/agents/${params.id}`);

  if (!res.ok) {
    error(res.status, 'Agent not found');
  }

  const data = await res.json();
  return { agent: data.agent as Agent };
};
