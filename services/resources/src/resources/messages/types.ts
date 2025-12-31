/** Types for Message resource */

import type { messages } from '../../schema';

export type Message = typeof messages.$inferSelect;
export type MessageRole = 'user' | 'agent';
