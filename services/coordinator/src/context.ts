/**
 * Context Management
 *
 * Manages workflow context storage in SQLite.
 * Context is a key-value store using JSONPath-style paths.
 */

/**
 * Initialize context table in SQLite storage
 */
export function initializeContextTable(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS context (
      path TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

/**
 * Get a value from context by path
 *
 * @param sql - SQLite storage
 * @param path - Context path (e.g., "input.task", "node1_output.result")
 * @returns Parsed value or undefined if not found
 */
export function getContextValue(sql: SqlStorage, path: string): unknown {
  const row = sql.exec(`SELECT value FROM context WHERE path = ?`, path).one();
  if (row) {
    return JSON.parse(row.value as string);
  }
  return undefined;
}

/**
 * Set a value in context
 *
 * @param sql - SQLite storage
 * @param path - Context path
 * @param value - Value to store (will be JSON stringified)
 */
export function setContextValue(sql: SqlStorage, path: string, value: unknown): void {
  sql.exec(
    `INSERT OR REPLACE INTO context (path, value) VALUES (?, ?)`,
    path,
    JSON.stringify(value),
  );
}

/**
 * Initialize context with workflow input
 *
 * @param sql - SQLite storage
 * @param input - Input object to store under "input.*" paths
 */
export function initializeContextWithInput(sql: SqlStorage, input: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(input)) {
    sql.exec(
      `INSERT INTO context (path, value) VALUES (?, ?)`,
      `input.${key}`,
      JSON.stringify(value),
    );
  }
}

/**
 * Store node output in context
 *
 * @param sql - SQLite storage
 * @param nodeRef - Node reference (stable identifier)
 * @param output - Output object to store under "{nodeRef}_output.*" paths
 */
export function setNodeOutput(
  sql: SqlStorage,
  nodeRef: string,
  output: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(output)) {
    const contextPath = `${nodeRef}_output.${key}`;
    sql.exec(
      `INSERT OR REPLACE INTO context (path, value) VALUES (?, ?)`,
      contextPath,
      JSON.stringify(value),
    );
  }
}
