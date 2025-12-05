/**
 * Mapping Service
 *
 * Handles JSONPath evaluation for input_mapping and output_mapping.
 * Pure data transformation functions - no side effects.
 */

import * as context from './context';

/**
 * Evaluate input_mapping to build template context
 *
 * Transforms context paths (e.g., "$.input.task") into template variables.
 * Used when building executor payloads.
 *
 * @param input_mapping - Map of variable names to JSONPath expressions
 * @param sql - SQLite storage for context access
 * @returns Template context object with resolved values
 */
export function evaluateInputMapping(
  input_mapping: Record<string, string> | object | null | undefined,
  sql: SqlStorage,
): Record<string, unknown> {
  const templateContext: Record<string, unknown> = {};

  if (!input_mapping) {
    return templateContext;
  }

  for (const [varName, jsonPath] of Object.entries(input_mapping)) {
    const pathStr = jsonPath as string;

    if (!pathStr.startsWith('$.')) {
      continue;
    }

    const contextPath = pathStr.slice(2); // Remove $.
    const value = context.getContextValue(sql, contextPath);

    if (value !== undefined) {
      templateContext[varName] = value;
    }
  }

  return templateContext;
}

/**
 * Evaluate output_mapping to transform action results
 *
 * Maps action output data to workflow context structure.
 * Used after action execution to store results.
 *
 * @param output_mapping - Map of output keys to JSONPath expressions
 * @param output_data - Raw action output data
 * @returns Mapped output object with transformed keys
 */
/**
 * Navigate a nested object path safely
 */
function getNestedValue(obj: unknown, pathParts: string[]): unknown {
  let value: any = obj;

  for (const part of pathParts) {
    if (!value || typeof value !== 'object' || !(part in value)) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

export function evaluateOutputMapping(
  output_mapping: Record<string, string> | object | null | undefined,
  output_data: Record<string, unknown>,
): Record<string, unknown> {
  const mappedOutput: Record<string, unknown> = {};

  if (!output_mapping) {
    // No mapping specified - use raw output as-is
    Object.assign(mappedOutput, output_data);
    return mappedOutput;
  }

  for (const [outputKey, jsonPath] of Object.entries(output_mapping)) {
    const pathStr = jsonPath as string;

    if (!pathStr.startsWith('$.')) {
      continue;
    }

    const sourcePath = pathStr.slice(2); // Remove $.
    const pathParts = sourcePath.split('.');
    const value = getNestedValue(output_data, pathParts);

    if (value !== undefined) {
      mappedOutput[outputKey] = value;
    }
  }

  return mappedOutput;
}
