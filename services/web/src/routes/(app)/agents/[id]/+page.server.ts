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

interface Participant {
  type: 'user' | 'agent';
  userId?: string;
  agentId?: string;
}

interface Conversation {
  id: string;
  participants: Participant[];
  status: 'active' | 'waiting' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export const load: PageServerLoad = async ({ fetch, params }) => {
  const [agentRes, conversationsRes] = await Promise.all([
    fetch(`/api/agents/${params.id}`),
    fetch(`/api/agents/${params.id}/conversations`),
  ]);

  if (!agentRes.ok) {
    error(agentRes.status, 'Agent not found');
  }

  const agentData = await agentRes.json();
  const conversationsData = conversationsRes.ok ? await conversationsRes.json() : { conversations: [] };

  return {
    agent: agentData.agent as Agent,
    conversations: conversationsData.conversations as Conversation[],
  };
};
