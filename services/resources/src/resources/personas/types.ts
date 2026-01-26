/** Type definitions for personas */

// ============================================================================
// Embedded JSON Types
// ============================================================================

/**
 * Agent constraints embedded in Persona
 * @see docs/architecture/agent.md
 */
export type AgentConstraints = {
  maxMovesPerTurn?: number;
};

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Persona entity - the API-facing shape.
 * Internally stored in the unified `definitions` table.
 *
 * BREAKING CHANGE: Now uses reference-based fields instead of ID-based:
 * - modelProfileRef + modelProfileVersion (replaces modelProfileId)
 * - contextAssemblyWorkflowRef + contextAssemblyWorkflowVersion (replaces contextAssemblyWorkflowDefId)
 * - memoryExtractionWorkflowRef + memoryExtractionWorkflowVersion (replaces memoryExtractionWorkflowDefId)
 */
export type Persona = {
  id: string;
  version: number;
  name: string;
  description: string;
  reference: string;
  libraryId: string | null;
  systemPrompt: string;

  // Reference-based model profile (null version = latest)
  modelProfileRef: string;
  modelProfileVersion: number | null;

  // Reference-based workflow definitions (null version = latest)
  contextAssemblyWorkflowRef: string;
  contextAssemblyWorkflowVersion: number | null;
  memoryExtractionWorkflowRef: string;
  memoryExtractionWorkflowVersion: number | null;

  recentTurnsLimit: number;
  toolIds: string[];
  constraints: AgentConstraints | null;

  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// API DTOs
// ============================================================================

/**
 * API input for creating a persona.
 *
 * BREAKING CHANGE: Now uses reference-based fields instead of ID-based.
 */
export type PersonaInput = {
  name: string;
  description?: string;
  reference?: string;
  libraryId?: string | null;
  systemPrompt: string;

  // Reference-based model profile (null version = latest)
  modelProfileRef: string;
  modelProfileVersion?: number | null;

  // Reference-based workflow definitions (null version = latest)
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
