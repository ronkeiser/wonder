/**
 * Context Stack
 *
 * Manages the context scope chain for template evaluation.
 * Supports parent context access via depth (../, ../../, etc.)
 */

/**
 * Stack for managing context objects during template evaluation.
 *
 * The stack maintains an ordered list of contexts from root to current.
 * Depth-based access allows resolving parent contexts for `../` paths.
 *
 * @example
 * ```typescript
 * const stack = new ContextStack();
 * stack.push({root: true});  // Root context
 * stack.push({level1: true}); // First nested level
 * stack.getAtDepth(0); // Returns {level1: true} (current)
 * stack.getAtDepth(1); // Returns {root: true} (parent)
 * ```
 */
export class ContextStack {
  private contexts: any[] = [];

  /**
   * Add a new context to the stack.
   * @param context - The context object to push
   */
  push(context: any): void {
    this.contexts.push(context);
  }

  /**
   * Remove and return the current context from the stack.
   * @returns The removed context, or undefined if stack is empty
   */
  pop(): any {
    return this.contexts.pop();
  }

  /**
   * Get the current context (last in stack).
   * @returns The current context, or undefined if stack is empty
   */
  getCurrent(): any {
    if (this.contexts.length === 0) {
      return undefined;
    }
    return this.contexts[this.contexts.length - 1];
  }

  /**
   * Get context at specified depth relative to current.
   *
   * @param depth - Number of levels up from current context
   *   - 0: current context
   *   - 1: parent context (../)
   *   - 2: grandparent context (../../)
   * @returns Context at specified depth, or root if depth exceeds stack size
   */
  getAtDepth(depth: number): any {
    if (this.contexts.length === 0) {
      return undefined;
    }

    // Calculate index: current position minus depth
    const index = this.contexts.length - 1 - depth;

    // If depth exceeds stack size, return root context
    if (index < 0) {
      return this.contexts[0];
    }

    return this.contexts[index];
  }

  /**
   * Get the root context (first in stack).
   * @returns The root context, or undefined if stack is empty
   */
  getRoot(): any {
    if (this.contexts.length === 0) {
      return undefined;
    }
    return this.contexts[0];
  }

  /**
   * Get the current stack depth.
   * @returns Number of contexts in the stack
   */
  size(): number {
    return this.contexts.length;
  }
}
