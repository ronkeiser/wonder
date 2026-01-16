import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ fetch }) => {
  const res = await fetch('/api/conversations?limit=50');
  if (!res.ok) {
    return { conversations: [] };
  }

  const data = await res.json();
  return { conversations: data.conversations as Conversation[] };
};
