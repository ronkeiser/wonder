import type { personas } from '~/schema';
import type { AgentConstraints } from '~/schema';

// Re-export for consumers
export type { AgentConstraints };

/** Persona entity — inferred from database schema. */
export type Persona = typeof personas.$inferSelect;

/** API input for creating a persona. */
export type PersonaInput = {
  name: string;
  description?: string;
  reference?: string;
  libraryId?: string | null;
  systemPrompt: string;
  modelProfileRef: string;
  modelProfileVersion?: number | null;
  contextAssemblyWorkflowRef: string;
  contextAssemblyWorkflowVersion?: number | null;
  memoryExtractionWorkflowRef: string;
  memoryExtractionWorkflowVersion?: number | null;
  recentTurnsLimit?: number;
  toolIds: string[];
  constraints?: AgentConstraints | null;
  autoversion?: boolean;
  force?: boolean;
};
