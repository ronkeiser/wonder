import type { PageServerLoad } from './$types';

interface Agent {
  id: string;
  projectIds: string[];
  personaId: string | null;
  personaVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/agents?limit=50');
  if (!res.ok) {
    return { agents: [] };
  }

  const data = await res.json();
  return { agents: data.agents as Agent[] };
};
