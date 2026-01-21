import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  projectIds: z.string().min(1, 'At least one project is required'), // Comma-separated, parsed server-side
  personaId: z.string().optional(),
});

export type CreateAgent = z.infer<typeof createAgentSchema>;
