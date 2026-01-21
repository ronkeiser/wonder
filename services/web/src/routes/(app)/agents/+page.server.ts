import type { PageServerLoad } from './$types';

interface Agent {
  id: string;
  name: string;
  projectIds: string[];
  personaId: string | null;
  personaVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Persona {
  id: string;
  name: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  const [agentsRes, personasRes] = await Promise.all([
    fetch('/api/agents?limit=50'),
    fetch('/api/personas?limit=100'),
  ]);

  const agents: Agent[] = agentsRes.ok ? (await agentsRes.json()).agents : [];
  const personas: Persona[] = personasRes.ok ? (await personasRes.json()).personas : [];

  const personaMap = new Map(personas.map((p) => [p.id, p.name]));

  return { agents, personaMap: Object.fromEntries(personaMap) };
};
