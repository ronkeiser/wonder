/**
 * Context Mapping Module
 *
 * Implements JSONPath-like expressions for input/output mapping.
 *
 * Supported syntax:
 * - $.input.name          → context.input.name
 * - $.state.items[0]      → first item in array
 * - $.state.items[-1]     → last item in array
 * - $.state.items[*].id   → array of all ids
 * - $.output.response     → context.output.response
 * - literal               → literal string value
 * - {{$.input.x}}         → template interpolation
 *
 * @see docs/architecture/executor.md
 */

import type { TaskContext } from '../execution/types';

/**
 * Get a value from context using a JSONPath-like expression
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;

  const parts = parsePath(path);
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (part.type === 'property') {
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part.key];
    } else if (part.type === 'index') {
      if (!Array.isArray(current)) return undefined;
      const idx = part.index < 0 ? current.length + part.index : part.index;
      current = current[idx];
    } else if (part.type === 'wildcard') {
      if (!Array.isArray(current)) return undefined;
      // Map over array and get remaining path from each element
      const remaining = parts.slice(parts.indexOf(part) + 1);
      if (remaining.length === 0) return current;

      return current.map((item) => {
        let val: unknown = item;
        for (const p of remaining) {
          if (val === null || val === undefined) return undefined;
          if (p.type === 'property') {
            if (typeof val !== 'object') return undefined;
            val = (val as Record<string, unknown>)[p.key];
          }
        }
        return val;
      });
    }
  }

  return current;
}

/**
 * Set a value in an object using a dot-path expression
 */
export function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  if (!path) return;

  const parts = parsePath(path);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (part.type === 'property') {
      if (
        !(part.key in current) ||
        typeof current[part.key] !== 'object' ||
        current[part.key] === null
      ) {
        // Look ahead to see if next part is array index
        const nextPart = parts[i + 1];
        current[part.key] = nextPart?.type === 'index' ? [] : {};
      }
      current = current[part.key] as Record<string, unknown>;
    } else if (part.type === 'index') {
      if (!Array.isArray(current)) return;
      const idx = part.index < 0 ? current.length + part.index : part.index;
      if (current[idx] === undefined || current[idx] === null || typeof current[idx] !== 'object') {
        const nextPart = parts[i + 1];
        (current as unknown[])[idx] = nextPart?.type === 'index' ? [] : {};
      }
      current = current[idx] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart.type === 'property') {
    current[lastPart.key] = value;
  } else if (lastPart.type === 'index') {
    const idx =
      lastPart.index < 0
        ? (current as unknown as unknown[]).length + lastPart.index
        : lastPart.index;
    (current as unknown as unknown[])[idx] = value;
  }
}

/**
 * Parse a path into parts
 */
interface PathPart {
  type: 'property' | 'index' | 'wildcard';
  key: string;
  index: number;
}

function parsePath(path: string): PathPart[] {
  const parts: PathPart[] = [];
  let current = path;

  // Remove leading $. if present
  if (current.startsWith('$.')) {
    current = current.slice(2);
  } else if (current.startsWith('$')) {
    current = current.slice(1);
  }

  // Match property names, array indices, and wildcards
  const regex = /(\w+)|\[(\d+|-\d+|\*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(current)) !== null) {
    if (match[1] !== undefined) {
      // Property name
      parts.push({ type: 'property', key: match[1], index: 0 });
    } else if (match[2] !== undefined) {
      // Array index or wildcard
      if (match[2] === '*') {
        parts.push({ type: 'wildcard', key: '*', index: 0 });
      } else {
        parts.push({ type: 'index', key: '', index: parseInt(match[2], 10) });
      }
    }
  }

  return parts;
}

/**
 * Apply input mapping from context to action input
 *
 * Format: { "targetField": "$.source.path" | "literal" | "{{template}}" }
 */
export function applyInputMapping(
  mapping: Record<string, unknown> | null | undefined,
  context: TaskContext,
): Record<string, unknown> {
  if (!mapping) return {};

  const result: Record<string, unknown> = {};

  for (const [targetField, sourceValue] of Object.entries(mapping)) {
    if (sourceValue === null || sourceValue === undefined) {
      result[targetField] = sourceValue;
      continue;
    }

    if (typeof sourceValue !== 'string') {
      // Non-string values are passed through directly
      result[targetField] = sourceValue;
      continue;
    }

    // Check for template interpolation: "Hello {{$.input.name}}"
    if (sourceValue.includes('{{') && sourceValue.includes('}}')) {
      result[targetField] = interpolateTemplate(
        sourceValue,
        context as unknown as Record<string, unknown>,
      );
      continue;
    }

    // Check for JSONPath expression: $.input.name
    if (sourceValue.startsWith('$.')) {
      result[targetField] = getValueByPath(context, sourceValue);
      continue;
    }

    // Literal value
    result[targetField] = sourceValue;
  }

  return result;
}

/**
 * Apply output mapping from action output to context
 *
 * Format: { "context.path": "$.output.path" | "literal" }
 */
export function applyOutputMapping(
  mapping: Record<string, unknown> | null | undefined,
  actionOutput: Record<string, unknown>,
  context: TaskContext,
): void {
  if (!mapping) {
    // Default behavior: store entire output in state._lastOutput
    context.state._lastOutput = actionOutput;
    return;
  }

  for (const [targetPath, sourceValue] of Object.entries(mapping)) {
    if (sourceValue === null || sourceValue === undefined) continue;

    let value: unknown;

    if (typeof sourceValue === 'string') {
      if (sourceValue.startsWith('$.')) {
        // Get from action output (wrap it so $.output.x works)
        value = getValueByPath({ output: actionOutput }, sourceValue);
      } else if (sourceValue.includes('{{') && sourceValue.includes('}}')) {
        // Template with output context
        value = interpolateTemplate(sourceValue, { ...context, _output: actionOutput });
      } else {
        // Literal
        value = sourceValue;
      }
    } else {
      // Non-string values are used directly
      value = sourceValue;
    }

    // Set in context
    setValueByPath(context as unknown as Record<string, unknown>, targetPath, value);
  }
}

/**
 * Interpolate template strings with context values
 *
 * "Hello {{$.input.name}}, you have {{$.state.count}} items"
 */
export function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    const value = getValueByPath(context, trimmed);

    if (value === undefined || value === null) {
      return '';
    }

    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/**
 * Deep merge two objects (used for context updates)
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}
