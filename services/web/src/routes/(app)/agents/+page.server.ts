import type { PageServerLoad } from './$types';

interface Agent {
  id: string;
  name: string;
  projectIds: string[];
  personaId: string | null;
  personaVersion: number | null;
  personaName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/agents?limit=50');
  const agents: Agent[] = res.ok ? (await res.json()).agents : [];

  return { agents };
};
