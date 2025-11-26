import type { LogEntry, LogLevel } from '../src/types.js';

export async function getLogCount(db: D1Database): Promise<number> {
  const result = await db.prepare('SELECT COUNT(*) as count FROM logs').first<{ count: number }>();
  return result?.count ?? 0;
}

export async function getLastLog(db: D1Database): Promise<LogEntry | null> {
  const result = await db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 1').first<{
    id: string;
    level: LogLevel;
    event_type: string;
    message: string | null;
    metadata: string;
    timestamp: number;
  }>();

  if (!result) return null;

  return {
    id: result.id,
    level: result.level,
    event_type: result.event_type,
    message: result.message ?? undefined,
    metadata: JSON.parse(result.metadata),
    timestamp: result.timestamp,
  };
}

export async function getAllLogs(db: D1Database): Promise<LogEntry[]> {
  const result = await db.prepare('SELECT * FROM logs ORDER BY timestamp ASC').all<{
    id: string;
    level: LogLevel;
    event_type: string;
    message: string | null;
    metadata: string;
    timestamp: number;
  }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    level: row.level,
    event_type: row.event_type,
    message: row.message ?? undefined,
    metadata: JSON.parse(row.metadata),
    timestamp: row.timestamp,
  }));
}

export async function clearLogs(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM logs').run();
}
