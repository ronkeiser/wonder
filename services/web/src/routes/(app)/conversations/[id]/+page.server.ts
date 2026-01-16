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

interface Message {
  id: string;
  conversationId: string;
  turnId: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
}

export const load: PageServerLoad = async ({ fetch, params }) => {
  const [conversationRes, messagesRes] = await Promise.all([
    fetch(`/api/conversations/${params.id}`),
    fetch(`/api/conversations/${params.id}/messages`),
  ]);

  if (!conversationRes.ok) {
    error(conversationRes.status, 'Conversation not found');
  }

  const conversationData = await conversationRes.json();
  const messagesData = messagesRes.ok ? await messagesRes.json() : { messages: [] };

  return {
    conversation: conversationData.conversation as Conversation,
    messages: messagesData.messages as Message[],
  };
};
