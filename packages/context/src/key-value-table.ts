/**
 * KeyValueTable - Non-schema-driven JSON storage
 *
 * Provides simple key-value storage for cases where schema-driven tables
 * are not appropriate (e.g., intermediate node outputs that need flexible structure).
 *
 * Uses the same SqlExecutor interface as SchemaTable for consistency.
 */

import type { SqlExecutor } from './schema.js';

/**
 * KeyValueTable provides non-schema-driven JSON storage.
 *
 * Unlike SchemaTable which generates normalized SQL from JSONSchema,
 * KeyValueTable stores arbitrary JSON values keyed by string keys.
 *
 * Use cases:
 * - Intermediate node outputs (before schema validation at finalization)
 * - Temporary storage during workflow execution
 * - Any case where flexible JSON storage is needed
 */
export class KeyValueTable {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly tableName: string,
  ) {}

  /**
   * Create the table (DROP IF EXISTS + CREATE)
   */
  create(): void {
    this.drop();
    this.sql.exec(`
      CREATE TABLE ${this.tableName} (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }

  /**
   * Create the table if it doesn't exist (no drop)
   */
  createIfNotExists(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }

  /**
   * Drop the table if it exists
   */
  drop(): void {
    this.sql.exec(`DROP TABLE IF EXISTS ${this.tableName};`);
  }

  /**
   * Set a value for a key (insert or replace)
   */
  set<T>(key: string, value: T): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO ${this.tableName} (key, value_json) VALUES (?, ?);`,
      key,
      JSON.stringify(value),
    );
  }

  /**
   * Get a value by key
   */
  get<T>(key: string): T | null {
    const results = this.sql.exec(`SELECT value_json FROM ${this.tableName} WHERE key = ?;`, key);

    for (const row of results) {
      const valueJson = row.value_json as string;
      return JSON.parse(valueJson) as T;
    }

    return null;
  }

  /**
   * Get all key-value pairs as an object
   */
  getAll<T = unknown>(): Record<string, T> {
    const results = this.sql.exec(`SELECT key, value_json FROM ${this.tableName};`);
    const entries: Record<string, T> = {};

    for (const row of results) {
      const key = row.key as string;
      const valueJson = row.value_json as string;
      entries[key] = JSON.parse(valueJson) as T;
    }

    return entries;
  }

  /**
   * Delete a key
   */
  delete(key: string): void {
    this.sql.exec(`DELETE FROM ${this.tableName} WHERE key = ?;`, key);
  }

  /**
   * Delete all entries
   */
  deleteAll(): void {
    this.sql.exec(`DELETE FROM ${this.tableName};`);
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    const results = this.sql.exec(`SELECT 1 FROM ${this.tableName} WHERE key = ? LIMIT 1;`, key);
    return [...results].length > 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    const results = this.sql.exec(`SELECT key FROM ${this.tableName};`);
    const keys: string[] = [];

    for (const row of results) {
      keys.push(row.key as string);
    }

    return keys;
  }

  /**
   * Check if the table exists
   */
  exists(): boolean {
    try {
      const result = this.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
        this.tableName,
      );
      return [...result].length > 0;
    } catch {
      return false;
    }
  }
}
