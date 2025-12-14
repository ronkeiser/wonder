/**
 * Assertion evaluation engine
 */

import type { AssertionObject, AssertionsDecl, AssertionValue } from '@wonder/wflow';

/**
 * Result of evaluating a single assertion
 */
export interface AssertionResult {
  path: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

/**
 * Get value at path from object
 */
function getValueAtPath(obj: unknown, pathStr: string): unknown {
  // Handle root path
  if (!pathStr || pathStr === '$') {
    return obj;
  }

  // Remove leading $. if present (but NOT output. - we need to navigate there)
  let cleanPath = pathStr;
  if (cleanPath.startsWith('$.')) {
    cleanPath = cleanPath.slice(2);
  }

  if (!cleanPath) {
    return obj;
  }

  const parts = cleanPath.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(indexStr, 10)];
    } else {
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => deepEqual(item, b[i]));
    }

    if (Array.isArray(a) || Array.isArray(b)) return false;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Evaluate a single assertion value against actual value
 */
function evaluateSingleAssertion(
  path: string,
  expected: AssertionValue,
  actual: unknown,
): AssertionResult {
  // Primitive value = implicit eq
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
    const passed = deepEqual(actual, expected);
    return {
      path,
      passed,
      expected,
      actual,
      message: passed
        ? undefined
        : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    };
  }

  // Assertion object
  const assertion = expected as AssertionObject;

  // eq
  if ('eq' in assertion) {
    const passed = deepEqual(actual, assertion.eq);
    return {
      path,
      passed,
      expected: assertion.eq,
      actual,
      message: passed
        ? undefined
        : `Expected ${JSON.stringify(assertion.eq)}, got ${JSON.stringify(actual)}`,
    };
  }

  // not_eq
  if ('not_eq' in assertion) {
    const passed = !deepEqual(actual, assertion.not_eq);
    return {
      path,
      passed,
      expected: `not ${JSON.stringify(assertion.not_eq)}`,
      actual,
      message: passed ? undefined : `Expected not to equal ${JSON.stringify(assertion.not_eq)}`,
    };
  }

  // gt
  if ('gt' in assertion && assertion.gt !== undefined) {
    const passed = typeof actual === 'number' && actual > assertion.gt;
    return {
      path,
      passed,
      expected: `> ${assertion.gt}`,
      actual,
      message: passed ? undefined : `Expected > ${assertion.gt}, got ${actual}`,
    };
  }

  // gte
  if ('gte' in assertion && assertion.gte !== undefined) {
    const passed = typeof actual === 'number' && actual >= assertion.gte;
    return {
      path,
      passed,
      expected: `>= ${assertion.gte}`,
      actual,
      message: passed ? undefined : `Expected >= ${assertion.gte}, got ${actual}`,
    };
  }

  // lt
  if ('lt' in assertion && assertion.lt !== undefined) {
    const passed = typeof actual === 'number' && actual < assertion.lt;
    return {
      path,
      passed,
      expected: `< ${assertion.lt}`,
      actual,
      message: passed ? undefined : `Expected < ${assertion.lt}, got ${actual}`,
    };
  }

  // lte
  if ('lte' in assertion && assertion.lte !== undefined) {
    const passed = typeof actual === 'number' && actual <= assertion.lte;
    return {
      path,
      passed,
      expected: `<= ${assertion.lte}`,
      actual,
      message: passed ? undefined : `Expected <= ${assertion.lte}, got ${actual}`,
    };
  }

  // contains
  if ('contains' in assertion) {
    let passed = false;
    if (typeof actual === 'string' && typeof assertion.contains === 'string') {
      passed = actual.includes(assertion.contains);
    } else if (Array.isArray(actual)) {
      passed = actual.some((item) => deepEqual(item, assertion.contains));
    }
    return {
      path,
      passed,
      expected: `contains ${JSON.stringify(assertion.contains)}`,
      actual,
      message: passed ? undefined : `Expected to contain ${JSON.stringify(assertion.contains)}`,
    };
  }

  // not_contains
  if ('not_contains' in assertion) {
    let passed = true;
    if (typeof actual === 'string' && typeof assertion.not_contains === 'string') {
      passed = !actual.includes(assertion.not_contains);
    } else if (Array.isArray(actual)) {
      passed = !actual.some((item) => deepEqual(item, assertion.not_contains));
    }
    return {
      path,
      passed,
      expected: `not contains ${JSON.stringify(assertion.not_contains)}`,
      actual,
      message: passed
        ? undefined
        : `Expected not to contain ${JSON.stringify(assertion.not_contains)}`,
    };
  }

  // matches (regex)
  if ('matches' in assertion && assertion.matches) {
    const regex = new RegExp(assertion.matches);
    const passed = typeof actual === 'string' && regex.test(actual);
    return {
      path,
      passed,
      expected: `matches /${assertion.matches}/`,
      actual,
      message: passed ? undefined : `Expected to match /${assertion.matches}/`,
    };
  }

  // starts_with
  if ('starts_with' in assertion && assertion.starts_with) {
    const passed = typeof actual === 'string' && actual.startsWith(assertion.starts_with);
    return {
      path,
      passed,
      expected: `starts with "${assertion.starts_with}"`,
      actual,
      message: passed ? undefined : `Expected to start with "${assertion.starts_with}"`,
    };
  }

  // ends_with
  if ('ends_with' in assertion && assertion.ends_with) {
    const passed = typeof actual === 'string' && actual.endsWith(assertion.ends_with);
    return {
      path,
      passed,
      expected: `ends with "${assertion.ends_with}"`,
      actual,
      message: passed ? undefined : `Expected to end with "${assertion.ends_with}"`,
    };
  }

  // length
  if ('length' in assertion && assertion.length !== undefined) {
    const actualLength =
      typeof actual === 'string' || Array.isArray(actual) ? actual.length : undefined;
    const passed = actualLength === assertion.length;
    return {
      path,
      passed,
      expected: `length ${assertion.length}`,
      actual: actualLength,
      message: passed ? undefined : `Expected length ${assertion.length}, got ${actualLength}`,
    };
  }

  // min_length
  if ('min_length' in assertion && assertion.min_length !== undefined) {
    const actualLength = typeof actual === 'string' || Array.isArray(actual) ? actual.length : 0;
    const passed = actualLength >= assertion.min_length;
    return {
      path,
      passed,
      expected: `min length ${assertion.min_length}`,
      actual: actualLength,
      message: passed
        ? undefined
        : `Expected min length ${assertion.min_length}, got ${actualLength}`,
    };
  }

  // max_length
  if ('max_length' in assertion && assertion.max_length !== undefined) {
    const actualLength =
      typeof actual === 'string' || Array.isArray(actual) ? actual.length : Infinity;
    const passed = actualLength <= assertion.max_length;
    return {
      path,
      passed,
      expected: `max length ${assertion.max_length}`,
      actual: actualLength,
      message: passed
        ? undefined
        : `Expected max length ${assertion.max_length}, got ${actualLength}`,
    };
  }

  // type
  if ('type' in assertion && assertion.type) {
    let actualType: string;
    if (actual === null) {
      actualType = 'null';
    } else if (Array.isArray(actual)) {
      actualType = 'array';
    } else {
      actualType = typeof actual;
    }
    const passed = actualType === assertion.type;
    return {
      path,
      passed,
      expected: `type ${assertion.type}`,
      actual: actualType,
      message: passed ? undefined : `Expected type ${assertion.type}, got ${actualType}`,
    };
  }

  // exists
  if ('exists' in assertion) {
    const exists = actual !== undefined;
    const passed = exists === assertion.exists;
    return {
      path,
      passed,
      expected: assertion.exists ? 'exists' : 'does not exist',
      actual: exists ? 'exists' : 'does not exist',
      message: passed
        ? undefined
        : assertion.exists
          ? 'Expected to exist'
          : 'Expected not to exist',
    };
  }

  // not_empty
  if ('not_empty' in assertion && assertion.not_empty) {
    let passed = false;
    if (typeof actual === 'string') {
      passed = actual.length > 0;
    } else if (Array.isArray(actual)) {
      passed = actual.length > 0;
    } else if (actual && typeof actual === 'object') {
      passed = Object.keys(actual).length > 0;
    }
    return {
      path,
      passed,
      expected: 'not empty',
      actual,
      message: passed ? undefined : 'Expected not to be empty',
    };
  }

  // has_keys
  if ('has_keys' in assertion && assertion.has_keys) {
    const actualKeys = actual && typeof actual === 'object' ? Object.keys(actual) : [];
    const missingKeys = assertion.has_keys.filter((k) => !actualKeys.includes(k));
    const passed = missingKeys.length === 0;
    return {
      path,
      passed,
      expected: `has keys [${assertion.has_keys.join(', ')}]`,
      actual: `[${actualKeys.join(', ')}]`,
      message: passed ? undefined : `Missing keys: [${missingKeys.join(', ')}]`,
    };
  }

  // every
  if ('every' in assertion && assertion.every !== undefined) {
    if (!Array.isArray(actual)) {
      return {
        path,
        passed: false,
        expected: 'array',
        actual: typeof actual,
        message: 'Expected an array for "every" assertion',
      };
    }

    const results = actual.map((item, i) =>
      evaluateSingleAssertion(`${path}[${i}]`, assertion.every!, item),
    );
    const passed = results.every((r) => r.passed);
    const failedIndex = results.findIndex((r) => !r.passed);

    return {
      path,
      passed,
      expected: 'every element matches',
      actual,
      message: passed
        ? undefined
        : `Element at index ${failedIndex} failed: ${results[failedIndex]?.message}`,
    };
  }

  // some
  if ('some' in assertion && assertion.some !== undefined) {
    if (!Array.isArray(actual)) {
      return {
        path,
        passed: false,
        expected: 'array',
        actual: typeof actual,
        message: 'Expected an array for "some" assertion',
      };
    }

    const results = actual.map((item, i) =>
      evaluateSingleAssertion(`${path}[${i}]`, assertion.some!, item),
    );
    const passed = results.some((r) => r.passed);

    return {
      path,
      passed,
      expected: 'some element matches',
      actual,
      message: passed ? undefined : 'No elements matched',
    };
  }

  // not
  if ('not' in assertion && assertion.not !== undefined) {
    const innerResult = evaluateSingleAssertion(path, assertion.not, actual);
    return {
      path,
      passed: !innerResult.passed,
      expected: `not (${innerResult.expected})`,
      actual,
      message: !innerResult.passed ? undefined : `Expected NOT: ${innerResult.message}`,
    };
  }

  // Unknown assertion - treat as implicit eq
  return {
    path,
    passed: deepEqual(actual, expected),
    expected,
    actual,
    message: `Unknown assertion type`,
  };
}

/**
 * Evaluate all assertions against output
 */
export function evaluateAssertions(assertions: AssertionsDecl, output: unknown): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const [path, assertion] of Object.entries(assertions)) {
    const actualValue = getValueAtPath(output, path);
    const result = evaluateSingleAssertion(path, assertion, actualValue);
    results.push(result);
  }

  return results;
}
