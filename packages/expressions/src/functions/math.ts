/**
 * Math functions for expressions
 *
 * All functions are pure and operate on numbers/arrays of numbers.
 */

/**
 * Sum of numbers in an array
 * @returns 0 for empty array
 * @throws If argument is not an array
 */
export function sum(arr: unknown): number {
  if (!Array.isArray(arr)) {
    throw new TypeError('sum() requires an array');
  }
  let total = 0;
  for (const item of arr) {
    if (typeof item === 'number') {
      total += item;
    }
  }
  return total;
}

/**
 * Average of numbers in an array
 * @returns NaN for empty array
 * @throws If argument is not an array
 */
export function avg(arr: unknown): number {
  if (!Array.isArray(arr)) {
    throw new TypeError('avg() requires an array');
  }
  if (arr.length === 0) {
    return NaN;
  }
  const numbers = arr.filter((item): item is number => typeof item === 'number');
  if (numbers.length === 0) {
    return NaN;
  }
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

/**
 * Minimum value in an array
 * @returns undefined for empty array
 * @throws If argument is not an array
 */
export function min(arr: unknown): number | undefined {
  if (!Array.isArray(arr)) {
    throw new TypeError('min() requires an array');
  }
  const numbers = arr.filter((item): item is number => typeof item === 'number');
  if (numbers.length === 0) {
    return undefined;
  }
  return Math.min(...numbers);
}

/**
 * Maximum value in an array
 * @returns undefined for empty array
 * @throws If argument is not an array
 */
export function max(arr: unknown): number | undefined {
  if (!Array.isArray(arr)) {
    throw new TypeError('max() requires an array');
  }
  const numbers = arr.filter((item): item is number => typeof item === 'number');
  if (numbers.length === 0) {
    return undefined;
  }
  return Math.max(...numbers);
}

/**
 * Round a number to specified decimal places
 * @param n The number to round
 * @param decimals Number of decimal places (default 0)
 * @throws If first argument is not a number
 */
export function round(n: unknown, decimals: unknown = 0): number {
  if (typeof n !== 'number') {
    throw new TypeError('round() requires a number as first argument');
  }
  if (typeof decimals !== 'number') {
    throw new TypeError('round() requires a number as second argument if provided');
  }
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Floor a number (round down)
 * @throws If argument is not a number
 */
export function floor(n: unknown): number {
  if (typeof n !== 'number') {
    throw new TypeError('floor() requires a number');
  }
  return Math.floor(n);
}

/**
 * Ceiling a number (round up)
 * @throws If argument is not a number
 */
export function ceil(n: unknown): number {
  if (typeof n !== 'number') {
    throw new TypeError('ceil() requires a number');
  }
  return Math.ceil(n);
}

/**
 * Absolute value of a number
 * @throws If argument is not a number
 */
export function abs(n: unknown): number {
  if (typeof n !== 'number') {
    throw new TypeError('abs() requires a number');
  }
  return Math.abs(n);
}
