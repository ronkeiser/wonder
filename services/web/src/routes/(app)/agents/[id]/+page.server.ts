import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

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

export const actions: Actions = {
  startConversation: async ({ fetch, params }) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [{ type: 'agent', agentId: params.id }],
        status: 'active',
      }),
    });

    if (!res.ok) {
      error(res.status, 'Failed to create conversation');
    }

    const data = await res.json();
    redirect(303, `/conversations/${data.conversationId}`);
  },
};
