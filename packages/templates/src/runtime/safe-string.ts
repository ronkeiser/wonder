/**
 * SafeString class for marking HTML that should not be escaped.
 *
 * Compatible with Handlebars.SafeString API.
 */
export class SafeString {
  private string: string;

  /**
   * Creates a SafeString that bypasses HTML escaping.
   *
   * @param string - The HTML string that should not be escaped
   *
   * @example
   * ```typescript
   * const safe = new SafeString('<b>bold</b>');
   * // Will render as: <b>bold</b> (not escaped)
   * ```
   */
  constructor(string: string) {
    this.string = string;
  }

  /**
   * Returns the unescaped HTML string.
   *
   * @returns The original HTML string
   */
  toString(): string {
    return this.string;
  }

  /**
   * Alias for toString() for compatibility.
   *
   * @returns The original HTML string
   */
  toHTML(): string {
    return this.string;
  }
}
