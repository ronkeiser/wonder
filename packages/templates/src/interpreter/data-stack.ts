/**
 * Data Stack
 *
 * Manages data frames for template evaluation.
 * Data frames contain loop metadata like @index, @first, @last, @key, @root.
 */

/**
 * Stack for managing data frames during template evaluation.
 *
 * Data frames contain metadata variables (prefixed with @) that are
 * accessible during template rendering. Each frame inherits from its
 * parent via the _parent property (using createFrame).
 *
 * @example
 * ```typescript
 * const stack = new DataStack();
 * stack.push({'@root': rootContext});  // Root frame
 * stack.push({'@index': 0, '@first': true}); // Loop iteration frame
 * stack.getCurrent(); // Returns current frame with loop metadata
 * ```
 */
export class DataStack {
  private frames: any[] = [];

  /**
   * Add a new data frame to the stack.
   * @param frame - The data frame object to push
   */
  push(frame: any): void {
    this.frames.push(frame);
  }

  /**
   * Remove and return the current data frame from the stack.
   * @returns The removed frame, or undefined if stack is empty
   */
  pop(): any {
    return this.frames.pop();
  }

  /**
   * Get the current data frame (last in stack).
   * @returns The current frame, or undefined if stack is empty
   */
  getCurrent(): any {
    if (this.frames.length === 0) {
      return undefined;
    }
    return this.frames[this.frames.length - 1];
  }

  /**
   * Get data frame at specified depth relative to current.
   *
   * @param depth - Number of levels up from current frame
   *   - 0: current frame
   *   - 1: parent frame
   *   - 2: grandparent frame
   * @returns Frame at specified depth, or root if depth exceeds stack size
   */
  getAtDepth(depth: number): any {
    if (this.frames.length === 0) {
      return undefined;
    }

    // Calculate index: current position minus depth
    const index = this.frames.length - 1 - depth;

    // If depth exceeds stack size, return root frame
    if (index < 0) {
      return this.frames[0];
    }

    return this.frames[index];
  }

  /**
   * Get the root data frame (first in stack).
   * @returns The root frame, or undefined if stack is empty
   */
  getRoot(): any {
    if (this.frames.length === 0) {
      return undefined;
    }
    return this.frames[0];
  }

  /**
   * Get the current stack depth.
   * @returns Number of frames in the stack
   */
  size(): number {
    return this.frames.length;
  }
}
