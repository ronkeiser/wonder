/**
 * Condition Evaluator
 *
 * Evaluates step conditions against task context.
 *
 * Supported expression syntax:
 * - Path access: $.input.name, $.state.count, $.output.result
 * - Comparison: ==, !=, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Existence: exists($.input.optional)
 * - Type checks: typeof($.input.value) == "string"
 * - Contains: contains($.state.tags, "urgent")
 * - Literals: "string", 123, true, false, null
 *
 * Examples:
 * - "$.input.auto_format == true"
 * - "$.state.retry_count < 3"
 * - "$.input.type == 'premium' && $.state.balance > 0"
 * - "exists($.input.optional_field)"
 * - "!$.state.is_cancelled"
 *
 * @see docs/architecture/executor.md
 */

import { getValueByPath } from '../context/mapping';
import type { TaskContext } from './types';

/**
 * Condition outcome types
 */
export type ConditionOutcome = 'continue' | 'skip' | 'succeed' | 'fail';

/**
 * Step condition structure
 */
export interface StepCondition {
  if: string;
  then?: ConditionOutcome;
  else?: ConditionOutcome;
}

/**
 * Evaluation result
 */
export interface ConditionResult {
  passed: boolean;
  outcome: ConditionOutcome;
  expression: string;
  evaluatedValue?: unknown;
}

/**
 * Evaluate a step condition against context
 */
export function evaluateCondition(
  condition: StepCondition | null | undefined,
  context: TaskContext,
): ConditionResult {
  if (!condition) {
    return { passed: true, outcome: 'continue', expression: '' };
  }

  const expr = condition.if.trim();

  try {
    const result = evaluateExpression(expr, context);
    const passed = toBoolean(result);

    return {
      passed,
      outcome: passed ? condition.then || 'continue' : condition.else || 'skip',
      expression: expr,
      evaluatedValue: result,
    };
  } catch (error) {
    // On evaluation error, condition fails (does not pass)
    return {
      passed: false,
      outcome: condition.else || 'skip',
      expression: expr,
      evaluatedValue: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Evaluate an expression and return its value
 */
function evaluateExpression(expr: string, context: TaskContext): unknown {
  expr = expr.trim();

  // Handle logical NOT: !expr
  if (expr.startsWith('!') && !expr.startsWith('!=')) {
    const inner = expr.slice(1).trim();
    return !toBoolean(evaluateExpression(inner, context));
  }

  // Handle logical OR: expr || expr (lowest precedence)
  const orParts = splitByOperator(expr, '||');
  if (orParts.length > 1) {
    for (const part of orParts) {
      if (toBoolean(evaluateExpression(part, context))) {
        return true;
      }
    }
    return false;
  }

  // Handle logical AND: expr && expr
  const andParts = splitByOperator(expr, '&&');
  if (andParts.length > 1) {
    for (const part of andParts) {
      if (!toBoolean(evaluateExpression(part, context))) {
        return false;
      }
    }
    return true;
  }

  // Handle comparison operators
  const comparisonOps = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'];
  for (const op of comparisonOps) {
    const parts = splitByOperator(expr, op);
    if (parts.length === 2) {
      const left = evaluateExpression(parts[0], context);
      const right = evaluateExpression(parts[1], context);
      return compareValues(left, right, op);
    }
  }

  // Handle parenthesized expressions
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evaluateExpression(expr.slice(1, -1), context);
  }

  // Handle function calls
  const funcMatch = expr.match(/^(\w+)\s*\((.*)\)$/);
  if (funcMatch) {
    const [, funcName, argsStr] = funcMatch;
    return evaluateFunction(funcName, argsStr, context);
  }

  // Handle JSONPath: $.input.name
  if (expr.startsWith('$.')) {
    return getValueByPath(context, expr);
  }

  // Handle literals
  return parseLiteral(expr);
}

/**
 * Split expression by operator, respecting parentheses
 */
function splitByOperator(expr: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (char === '(') {
      depth++;
      current += char;
      i++;
    } else if (char === ')') {
      depth--;
      current += char;
      i++;
    } else if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(current.trim());
      current = '';
      i += op.length;
    } else {
      current += char;
      i++;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.length > 1 ? parts : [expr];
}

/**
 * Compare two values with an operator
 */
function compareValues(left: unknown, right: unknown, op: string): boolean {
  switch (op) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '==':
      // Loose equality with type coercion
      // eslint-disable-next-line eqeqeq
      return left == right;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return left != right;
    case '<':
      return toNumber(left) < toNumber(right);
    case '>':
      return toNumber(left) > toNumber(right);
    case '<=':
      return toNumber(left) <= toNumber(right);
    case '>=':
      return toNumber(left) >= toNumber(right);
    default:
      return false;
  }
}

/**
 * Evaluate built-in functions
 */
function evaluateFunction(name: string, argsStr: string, context: TaskContext): unknown {
  const args = parseArguments(argsStr, context);

  switch (name.toLowerCase()) {
    case 'exists':
      return args[0] !== undefined && args[0] !== null;

    case 'typeof':
      return typeof args[0];

    case 'len':
    case 'length':
      if (Array.isArray(args[0])) return args[0].length;
      if (typeof args[0] === 'string') return args[0].length;
      if (typeof args[0] === 'object' && args[0] !== null) {
        return Object.keys(args[0]).length;
      }
      return 0;

    case 'contains':
      if (Array.isArray(args[0])) {
        return args[0].includes(args[1]);
      }
      if (typeof args[0] === 'string' && typeof args[1] === 'string') {
        return args[0].includes(args[1]);
      }
      return false;

    case 'startswith':
      if (typeof args[0] === 'string' && typeof args[1] === 'string') {
        return args[0].startsWith(args[1]);
      }
      return false;

    case 'endswith':
      if (typeof args[0] === 'string' && typeof args[1] === 'string') {
        return args[0].endsWith(args[1]);
      }
      return false;

    case 'isempty':
      if (args[0] === null || args[0] === undefined) return true;
      if (Array.isArray(args[0])) return args[0].length === 0;
      if (typeof args[0] === 'string') return args[0].length === 0;
      if (typeof args[0] === 'object') return Object.keys(args[0]).length === 0;
      return false;

    case 'isnumber':
      return typeof args[0] === 'number' && !isNaN(args[0]);

    case 'isstring':
      return typeof args[0] === 'string';

    case 'isarray':
      return Array.isArray(args[0]);

    case 'isobject':
      return typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0]);

    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

/**
 * Parse function arguments
 */
function parseArguments(argsStr: string, context: TaskContext): unknown[] {
  if (!argsStr.trim()) return [];

  const args: unknown[] = [];
  let depth = 0;
  let current = '';

  for (const char of argsStr) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      args.push(evaluateExpression(current.trim(), context));
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(evaluateExpression(current.trim(), context));
  }

  return args;
}

/**
 * Parse a literal value
 */
function parseLiteral(expr: string): unknown {
  expr = expr.trim();

  // Boolean literals
  if (expr === 'true') return true;
  if (expr === 'false') return false;

  // Null literal
  if (expr === 'null') return null;

  // Undefined literal
  if (expr === 'undefined') return undefined;

  // String literals (single or double quoted)
  if (
    (expr.startsWith('"') && expr.endsWith('"')) ||
    (expr.startsWith("'") && expr.endsWith("'"))
  ) {
    return expr.slice(1, -1);
  }

  // Number literals
  const num = Number(expr);
  if (!isNaN(num)) return num;

  // Unquoted string (treat as path without $.)
  // This allows "input.name" as shorthand for "$.input.name"
  return expr;
}

/**
 * Convert value to boolean
 */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Convert value to number for comparison
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}
