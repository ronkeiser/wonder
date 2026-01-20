import type { PageServerLoad } from './$types';

interface Persona {
  id: string;
  version: number;
  name: string;
  description: string;
  libraryId: string | null;
  systemPrompt: string;
  modelProfileId: string;
  contextAssemblyWorkflowId: string;
  memoryExtractionWorkflowId: string;
  recentTurnsLimit: number;
  toolIds: string[];
  constraints: { maxMovesPerTurn?: number } | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/personas?limit=50');
  if (!res.ok) {
    return { personas: [] };
  }

  const data = await res.json();
  return { personas: data.personas as Persona[] };
};
