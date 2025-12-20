/** Shared type utilities for @wonder/resources */

/**
 * Standard fields auto-generated on insert for most entities.
 * These are typically: id (ULID), createdAt, updatedAt (ISO timestamps)
 */
type StandardAutoFields = 'id' | 'createdAt' | 'updatedAt';

/**
 * Create a "New" type for inserts, omitting standard auto-generated fields.
 * Use this for entities that have id, createdAt, and updatedAt.
 *
 * @example
 * type NewTask = NewEntity<typeof tasks.$inferInsert>;
 */
export type NewEntity<T> = Omit<T, StandardAutoFields>;

/**
 * Create a "New" type for inserts, omitting only the id field.
 * Use this for entities that don't have timestamp fields (e.g., model_profiles).
 *
 * @example
 * type NewModelProfile = NewEntityIdOnly<typeof model_profiles.$inferInsert>;
 */
export type NewEntityIdOnly<T> = Omit<T, 'id'>;
