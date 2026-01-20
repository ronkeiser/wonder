/**
 * Model document validation and analysis
 */

import type { ImportsMap } from '../parser/index.js';
import type { Diagnostic, ModelDocument } from '../types/index.js';
import { DiagnosticSeverity } from '../types/index.js';
import { MODEL_ALLOWED_PROPS, VALID_MODEL_PROVIDERS } from './schema.js';

/**
 * Validate a model document
 */
export function validateModelDocument(doc: ModelDocument, _imports: ImportsMap): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Check for unknown top-level properties
  for (const key of Object.keys(doc)) {
    if (key.startsWith('_')) continue;
    if (!MODEL_ALLOWED_PROPS.has(key)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: key.length },
        },
        message: `Unknown property '${key}' in model document`,
        source: 'wflow',
        code: 'UNKNOWN_PROPERTY',
      });
    }
  }

  // Validate model name is present
  if (!doc.model) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'model'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate provider is present and valid
  if (!doc.provider) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'provider'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  } else if (!VALID_MODEL_PROVIDERS.includes(doc.provider as typeof VALID_MODEL_PROVIDERS[number])) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: `Invalid provider '${doc.provider}'. Must be one of: ${VALID_MODEL_PROVIDERS.join(', ')}`,
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  // Validate modelId is present
  if (!doc.modelId) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "Missing required property 'model_id'",
      source: 'wflow',
      code: 'MISSING_REQUIRED',
    });
  }

  // Validate cost fields are non-negative if provided
  if (doc.costPer_1kInputTokens !== undefined && doc.costPer_1kInputTokens < 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "'cost_per_1k_input_tokens' must be non-negative",
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  if (doc.costPer_1kOutputTokens !== undefined && doc.costPer_1kOutputTokens < 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      message: "'cost_per_1k_output_tokens' must be non-negative",
      source: 'wflow',
      code: 'INVALID_VALUE',
    });
  }

  return diagnostics;
}
