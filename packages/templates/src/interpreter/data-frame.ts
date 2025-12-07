/**
 * Data Frame Management
 *
 * Functions for creating and managing data frames with loop metadata.
 * Data frames contain special @ variables like @index, @first, @last, @key, @root.
 */

import { createFrame } from '../runtime/utils.js';

/**
 * Metadata stored in a data frame for loop iteration.
 *
 * Data frames are created by block helpers (like #each) to provide
 * iteration metadata. All properties are prefixed with @ in the frame.
 */
export interface DataFrameMetadata {
  /**
   * Zero-based index of current iteration.
   * Set for both array and object iteration.
   */
  '@index'?: number;

  /**
   * True if this is the first iteration.
   */
  '@first'?: boolean;

  /**
   * True if this is the last iteration.
   */
  '@last'?: boolean;

  /**
   * Property name during object iteration.
   * Not set for array iteration.
   */
  '@key'?: string;

  /**
   * Reference to the root context.
   * Set once at initialization and inherited by all child frames.
   */
  '@root'?: any;

  /**
   * Reference to parent data frame for scope chain.
   * Automatically set by createFrame().
   */
  _parent?: any;

  /**
   * Allow additional custom properties.
   */
  [key: string]: any;
}

/**
 * Creates a new data frame with loop metadata.
 *
 * Uses createFrame() to create a frame that inherits from the parent,
 * then adds the specified metadata properties.
 *
 * @param parentFrame - Parent data frame (or null for root frame)
 * @param metadata - Metadata to add to the frame (@index, @first, etc.)
 * @returns New data frame with metadata
 *
 * @example
 * ```typescript
 * // Create root frame
 * const rootFrame = createDataFrame(null, { '@root': context });
 *
 * // Create child frame for first iteration
 * const childFrame = createDataFrame(rootFrame, {
 *   '@index': 0,
 *   '@first': true,
 *   '@last': false
 * });
 *
 * console.log(childFrame['@index']); // 0
 * console.log(childFrame['@root']); // context (inherited from parent)
 * ```
 */
export function createDataFrame(parentFrame: any, metadata: Partial<DataFrameMetadata>): any {
  // Create frame that inherits from parent via _parent reference
  const frame = createFrame(parentFrame);

  // Add all metadata properties to the frame
  for (const key in metadata) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      frame[key] = metadata[key];
    }
  }

  return frame;
}
