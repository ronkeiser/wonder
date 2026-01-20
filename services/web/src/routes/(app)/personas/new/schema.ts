import { z } from 'zod';

export const createPersonaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  description: z.string().max(1000, 'Description is too long').optional(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  modelProfileId: z.string().min(1, 'Model profile is required'),
  contextAssemblyWorkflowId: z.string().min(1, 'Context assembly workflow is required'),
  memoryExtractionWorkflowId: z.string().min(1, 'Memory extraction workflow is required'),
  recentTurnsLimit: z.string().optional(), // Parsed to number server-side
  toolIds: z.string().optional(), // Comma-separated list, will be parsed
});

export type CreatePersona = z.infer<typeof createPersonaSchema>;
