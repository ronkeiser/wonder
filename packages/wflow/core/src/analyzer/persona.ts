/**
 * Persona document validation and analysis
 */

import type { ImportsMap } from '../parser/index.js';
import type { Diagnostic, PersonaDocument } from '../types/index.js';
import { DiagnosticSeverity } from '../types/index.js';
import { PERSONA_ALLOWED_PROPS, PERSONA_CONSTRAINTS_ALLOWED_PROPS } from './schema.js';

/**
 * Validate a persona document
 */
export function validatePersonaDocument(doc: PersonaDocument, imports: ImportsMap): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check for unknown top-level properties
  for (const key of Object.keys(doc)) {
    if (key.startsWith('_')) continue;
    if (!PERSONA_ALLOWED_PROPS.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: key.length },
        },
        message: `Unknown property '${key}' in persona document`,
        source: 'wflow',
        code: 'UNKNOWN_PROPERTY',
      });
    }
  }

  // Validate persona name is present
  if (!doc.persona) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'persona'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate systemPrompt is present
  if (!doc.systemPrompt) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'system_prompt'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate modelProfileId is present
  if (!doc.modelProfileId) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'model_profile_id'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate contextAssemblyWorkflowDefId is present
  if (!doc.contextAssemblyWorkflowDefId) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'context_assembly_workflow_id'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate memoryExtractionWorkflowDefId is present
  if (!doc.memoryExtractionWorkflowDefId) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'memory_extraction_workflow_id'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate toolIds is present (can be empty array)
  if (doc.toolIds === undefined) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'tool_ids'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate toolIds reference imports
  if (doc.toolIds && Array.isArray(doc.toolIds)) {
    for (const toolId of doc.toolIds) {
      // Check if it's a reference that should be in imports
      if (typeof toolId === 'string' && !toolId.startsWith('@') && !imports.byAlias.has(toolId)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `Tool ID '${toolId}' is not imported`,
          source: 'wflow',
          code: 'UNRESOLVED_IMPORT',
        });
      }
    }
  }

  // Validate constraints structure
  if (doc.constraints && typeof doc.constraints === 'object') {
    for (const key of Object.keys(doc.constraints)) {
      if (!PERSONA_CONSTRAINTS_ALLOWED_PROPS.has(key)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `Unknown constraint property '${key}'`,
          source: 'wflow',
          code: 'UNKNOWN_PROPERTY',
        });
      }
    }

    // Validate maxMovesPerTurn is a positive number
    if (
      doc.constraints.maxMovesPerTurn !== undefined &&
      (typeof doc.constraints.maxMovesPerTurn !== 'number' || doc.constraints.maxMovesPerTurn <= 0)
    ) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: "'max_moves_per_turn' must be a positive number",
        source: 'wflow',
        code: 'INVALID_VALUE',
      });
    }
  }

  // Validate recentTurnsLimit is a positive number if provided
  if (
    doc.recentTurnsLimit !== undefined &&
    (typeof doc.recentTurnsLimit !== 'number' || doc.recentTurnsLimit <= 0)
  ) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "'recent_turns_limit' must be a positive number",
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  return diagnostics;
}
