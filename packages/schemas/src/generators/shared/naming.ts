/**
 * Naming utilities for SQL generators
 *
 * Provides consistent column and table naming across DDL, DML, and Select generators.
 */

/**
 * Build a column name with optional prefix for nested fields.
 * Uses underscore as separator for flattened nested objects.
 *
 * @example
 * buildColumnName('', 'name') // 'name'
 * buildColumnName('metadata', 'timestamp') // 'metadata_timestamp'
 * buildColumnName('user_profile', 'name') // 'user_profile_name'
 */
export function buildColumnName(prefix: string, fieldName: string): string {
  return prefix ? `${prefix}_${fieldName}` : fieldName;
}

/**
 * Build an array table name from parent table and field name.
 *
 * @example
 * buildArrayTableName('users', 'tags', '') // 'users_tags'
 * buildArrayTableName('users', 'tags', 'arr_') // 'arr_users_tags'
 * buildArrayTableName('posts_comments', 'likes', '') // 'posts_comments_likes'
 */
export function buildArrayTableName(
  parentTableName: string,
  fieldName: string,
  prefix: string = '',
): string {
  return `${prefix}${parentTableName}_${fieldName}`;
}

/**
 * Build a foreign key column name referencing a parent table.
 *
 * @example
 * buildForeignKeyColumnName('users') // 'users_id'
 * buildForeignKeyColumnName('posts_comments') // 'posts_comments_id'
 */
export function buildForeignKeyColumnName(parentTableName: string): string {
  return `${parentTableName}_id`;
}
