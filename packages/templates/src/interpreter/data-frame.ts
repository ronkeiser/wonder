/**
 * Data Frame Management
 *
 * Functions for creating and managing data frames with loop metadata.
 * Data frames contain special @ variables like @index, @first, @last, @key, @root.
 */

import { createFrame, lookupProperty } from '../runtime/utils';

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

/**
 * Gets a data variable from a frame using secure property access.
 *
 * Uses lookupProperty() for security to prevent prototype pollution.
 * Only accesses own properties, not inherited ones.
 *
 * @param frame - The data frame to read from
 * @param name - The property name to access (e.g., '@index', '@root')
 * @returns The value of the property, or undefined if not found
 *
 * @example
 * ```typescript
 * const frame = createDataFrame(null, { '@index': 0, '@first': true });
 * getDataVariable(frame, '@index'); // 0
 * getDataVariable(frame, '@missing'); // undefined
 * ```
 */
export function getDataVariable(frame: any, name: string): any {
  return lookupProperty(frame, name);
}

/**
 * Sets a data variable on a frame as an own property.
 *
 * Used when creating frames with metadata or updating frame properties.
 *
 * @param frame - The data frame to modify
 * @param name - The property name to set (e.g., '@index', '@key')
 * @param value - The value to set
 *
 * @example
 * ```typescript
 * const frame = createDataFrame(null, {});
 * setDataVariable(frame, '@index', 5);
 * console.log(frame['@index']); // 5
 * ```
 */
export function setDataVariable(frame: any, name: string, value: any): void {
  if (frame != null) {
    frame[name] = value;
  }
}
