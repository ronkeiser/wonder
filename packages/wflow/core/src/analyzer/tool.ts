/**
 * Tool document validation and analysis
 */

import type { ImportsMap } from '../parser/index.js';
import type { Diagnostic, ToolDocument } from '../types/index.js';
import { DiagnosticSeverity } from '../types/index.js';
import {
  TOOL_ALLOWED_PROPS,
  TOOL_RETRY_ALLOWED_PROPS,
  VALID_TOOL_INVOCATION_MODES,
  VALID_TOOL_TARGET_TYPES,
} from './schema.js';

/**
 * Validate a tool document
 */
export function validateToolDocument(doc: ToolDocument, imports: ImportsMap): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check for unknown top-level properties
  for (const key of Object.keys(doc)) {
    if (key.startsWith('_')) continue;
    if (!TOOL_ALLOWED_PROPS.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: key.length },
        },
        message: `Unknown property '${key}' in tool document`,
        source: 'wflow',
        code: 'UNKNOWN_PROPERTY',
      });
    }
  }

  // Validate tool name is present
  if (!doc.tool) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'tool'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate description is present
  if (!doc.description) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'description'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate inputSchema is present
  if (!doc.inputSchema) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'input_schema'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate targetType is present and valid
  if (!doc.targetType) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'target_type'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  } else if (!VALID_TOOL_TARGET_TYPES.includes(doc.targetType as (typeof VALID_TOOL_TARGET_TYPES)[number])) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: `Invalid target_type '${doc.targetType}'. Must be one of: ${VALID_TOOL_TARGET_TYPES.join(', ')}`,
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  // Validate targetId is present
  if (!doc.targetId) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'target_id'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  } else {
    // Check if targetId references an import (if not a library reference)
    if (!doc.targetId.startsWith('@') && !imports.byAlias.has(doc.targetId)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: `Target ID '${doc.targetId}' is not imported`,
        source: 'wflow',
        code: 'UNRESOLVED_IMPORT',
      });
    }
  }

  // Validate invocationMode is only used with agent targets
  if (doc.invocationMode !== undefined) {
    if (doc.targetType !== 'agent') {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: "'invocation_mode' is only valid when target_type is 'agent'",
        source: 'wflow',
        code: 'INVALID_PROPERTY',
      });
    } else if (
      !VALID_TOOL_INVOCATION_MODES.includes(doc.invocationMode as (typeof VALID_TOOL_INVOCATION_MODES)[number])
    ) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: `Invalid invocation_mode '${doc.invocationMode}'. Must be one of: ${VALID_TOOL_INVOCATION_MODES.join(', ')}`,
        source: 'wflow',
        code: 'INVALID_VALUE',
      });
    }
  }

  // Validate async is boolean if provided
  if (doc.async !== undefined && typeof doc.async !== 'boolean') {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "'async' must be a boolean",
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  // Validate retry configuration
  if (doc.retry && typeof doc.retry === 'object') {
    for (const key of Object.keys(doc.retry)) {
      if (!TOOL_RETRY_ALLOWED_PROPS.has(key)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `Unknown retry property '${key}'`,
          source: 'wflow',
          code: 'UNKNOWN_PROPERTY',
        });
      }
    }

    // Validate retry values are positive numbers
    const retryFields = ['maxAttempts', 'backoffMs', 'timeoutMs'] as const;
    for (const field of retryFields) {
      const value = doc.retry[field];
      if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
        const snakeField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `'retry.${snakeField}' must be a positive number`,
          source: 'wflow',
          code: 'INVALID_VALUE',
        });
      }
    }
  }

  // Validate inputMapping values are strings (JSONPath expressions)
  if (doc.inputMapping && typeof doc.inputMapping === 'object') {
    for (const [key, value] of Object.entries(doc.inputMapping)) {
      if (typeof value !== 'string') {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          message: `Input mapping '${key}' must be a string (JSONPath expression)`,
          source: 'wflow',
          code: 'INVALID_VALUE',
        });
      }
    }
  }

  return diagnostics;
}
