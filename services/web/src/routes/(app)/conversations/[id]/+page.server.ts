import { error } from '@sveltejs/kit';
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

export const load: PageServerLoad = async ({ fetch, params }) => {
  const res = await fetch(`/api/conversations/${params.id}`);

  if (!res.ok) {
    error(res.status, 'Conversation not found');
  }

  const data = await res.json();
  return { conversation: data.conversation as Conversation };
};
