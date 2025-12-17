/**
 * Array functions for expressions
 *
 * All functions are pure and return new arrays (never mutate input).
 */

/**
 * Return the length of an array
 * @throws If value is not an array
 */
export function length(arr: unknown): number {
  if (!Array.isArray(arr)) {
    throw new TypeError('length() requires an array');
  }
  return arr.length;
}

/**
 * Return a new array with item appended at the end
 * @throws If first argument is not an array
 */
export function append(arr: unknown, item: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('append() requires an array as first argument');
  }
  return [...arr, item];
}

/**
 * Concatenate multiple arrays into a new array
 * Non-array values are added as single elements
 */
export function concat(...args: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      result.push(...arg);
    } else {
      result.push(arg);
    }
  }
  return result;
}

/**
 * Return the first element of an array
 * @returns undefined if array is empty
 * @throws If value is not an array
 */
export function first(arr: unknown): unknown {
  if (!Array.isArray(arr)) {
    throw new TypeError('first() requires an array');
  }
  return arr[0];
}

/**
 * Return the last element of an array
 * @returns undefined if array is empty
 * @throws If value is not an array
 */
export function last(arr: unknown): unknown {
  if (!Array.isArray(arr)) {
    throw new TypeError('last() requires an array');
  }
  return arr[arr.length - 1];
}

/**
 * Return a slice of an array
 * Supports negative indices (from end)
 * @throws If first argument is not an array
 */
export function slice(arr: unknown, start: unknown, end?: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('slice() requires an array as first argument');
  }
  if (typeof start !== 'number') {
    throw new TypeError('slice() requires a number as second argument');
  }
  if (end !== undefined && typeof end !== 'number') {
    throw new TypeError('slice() requires a number as third argument if provided');
  }
  return arr.slice(start, end as number | undefined);
}

/**
 * Check if an array includes an item (strict equality)
 * @throws If first argument is not an array
 */
export function includes(arr: unknown, item: unknown): boolean {
  if (!Array.isArray(arr)) {
    throw new TypeError('includes() requires an array as first argument');
  }
  return arr.includes(item);
}

/**
 * Return a new array with duplicate values removed
 * Uses strict equality (===) for comparison
 * @throws If value is not an array
 */
export function unique(arr: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('unique() requires an array');
  }
  return [...new Set(arr)];
}

/**
 * Flatten an array one level deep
 * Non-array elements are kept as-is
 * @throws If value is not an array
 */
export function flatten(arr: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('flatten() requires an array');
  }
  const result: unknown[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Return a sorted copy of an array
 * Numbers are sorted numerically, strings alphabetically
 * Mixed types: numbers first, then strings, then others
 * @throws If value is not an array
 */
export function sort(arr: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('sort() requires an array');
  }
  return [...arr].sort((a, b) => {
    // Both numbers: numeric sort
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    // Both strings: alphabetic sort
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    // Mixed types: numbers < strings < others
    const typeOrder = (v: unknown): number => {
      if (typeof v === 'number') return 0;
      if (typeof v === 'string') return 1;
      return 2;
    };
    const aOrder = typeOrder(a);
    const bOrder = typeOrder(b);
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    // Same type but not number/string: preserve order
    return 0;
  });
}

/**
 * Return a reversed copy of an array
 * @throws If value is not an array
 */
export function reverse(arr: unknown): unknown[] {
  if (!Array.isArray(arr)) {
    throw new TypeError('reverse() requires an array');
  }
  return [...arr].reverse();
}
