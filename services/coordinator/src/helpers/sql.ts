/**
 * SQL tracing utilities
 */

/** SQL operation patterns for message composition */
const SQL_PATTERNS: Array<{
  prefix: string;
  tablePattern: RegExp;
}> = [
  { prefix: 'SELECT', tablePattern: /FROM\s+(\w+)/i },
  { prefix: 'INSERT', tablePattern: /INTO\s+(\w+)/i },
  { prefix: 'UPDATE', tablePattern: /UPDATE\s+(\w+)/i },
  { prefix: 'DELETE', tablePattern: /FROM\s+(\w+)/i },
  { prefix: 'CREATE', tablePattern: /TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i },
  { prefix: 'DROP', tablePattern: /TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i },
];

/**
 * Compose a human-readable message from SQL query
 * e.g., "SELECT context_input (0.12ms)"
 */
export function composeSqlMessage(sql: string, durationMs: number): string {
  const normalized = sql.trim().toUpperCase();
  const operation = normalized.split(/\s+/)[0] || 'QUERY';

  const pattern = SQL_PATTERNS.find((p) => normalized.startsWith(p.prefix));
  const table = pattern?.tablePattern.exec(sql)?.[1] ?? '';

  const duration = Math.round(durationMs * 100) / 100;
  return table ? `${operation} ${table} (${duration}ms)` : `${operation} (${duration}ms)`;
}
