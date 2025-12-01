import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../src/index.js';
import { clearLogs, getAllLogs, getLastLog, getLogCount } from './helpers.js';

const SCHEMA = `
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_level ON logs(level, timestamp);
`;

describe('logger', () => {
  let db: D1Database;

  beforeAll(async () => {
    db = env.DB;
    // Split schema into individual statements for exec
    const statements = SCHEMA.trim()
      .split(';')
      .filter((s) => s.trim());
    for (const stmt of statements) {
      await db.prepare(stmt).run();
    }
  });

  afterEach(async () => {
    await clearLogs(db);
  });

  describe('log levels', () => {
    it('debug logs only to console, not persisted', async () => {
      const logger = createLogger({ db });

      logger.debug('debug_event', { foo: 'bar' });
      await logger.flush();

      const count = await getLogCount(db);
      expect(count).toBe(0);
    });

    it('info logs are persisted', async () => {
      const logger = createLogger({ db });

      logger.info('info_event', { foo: 'bar' });
      await logger.flush();

      const count = await getLogCount(db);
      expect(count).toBe(1);

      const log = await getLastLog(db);
      expect(log?.level).toBe('info');
      expect(log?.event_type).toBe('info_event');
      expect(log?.metadata).toEqual({ foo: 'bar' });
    });

    it('warn logs are persisted', async () => {
      const logger = createLogger({ db });

      logger.warn('warn_event', { issue: 'slow_query' });
      await logger.flush();

      const log = await getLastLog(db);
      expect(log?.level).toBe('warn');
      expect(log?.event_type).toBe('warn_event');
    });

    it('error logs are persisted', async () => {
      const logger = createLogger({ db });

      logger.error('error_event', { error: 'validation_failed' });
      await logger.flush();

      const log = await getLastLog(db);
      expect(log?.level).toBe('error');
      expect(log?.event_type).toBe('error_event');
    });

    it('fatal logs are persisted and flushed immediately', async () => {
      const logger = createLogger({ db });

      logger.fatal('fatal_event', { critical: true });

      // Should be flushed without explicit call
      await new Promise((resolve) => setTimeout(resolve, 100));

      const log = await getLastLog(db);
      expect(log?.level).toBe('fatal');
      expect(log?.event_type).toBe('fatal_event');
    });
  });

  describe('buffering', () => {
    it('buffers logs until flush is called', async () => {
      const logger = createLogger({ db });

      logger.info('event_1');
      logger.info('event_2');

      // Nothing flushed yet
      let count = await getLogCount(db);
      expect(count).toBe(0);

      await logger.flush();

      // Now both are persisted
      count = await getLogCount(db);
      expect(count).toBe(2);
    });

    it('auto-flushes at buffer threshold', async () => {
      const logger = createLogger({ db, bufferSize: 3 });

      logger.info('event_1');
      logger.info('event_2');

      // Not flushed yet
      let count = await getLogCount(db);
      expect(count).toBe(0);

      logger.info('event_3');

      // Auto-flush triggered
      await new Promise((resolve) => setTimeout(resolve, 100));

      count = await getLogCount(db);
      expect(count).toBe(3);
    });

    it('flush is idempotent when buffer is empty', async () => {
      const logger = createLogger({ db });

      await logger.flush();
      await logger.flush();

      const count = await getLogCount(db);
      expect(count).toBe(0);
    });
  });

  describe('child loggers', () => {
    it('child inherits parent metadata', async () => {
      const logger = createLogger({ db });
      const child = logger.child({ requestId: 'req_123' });

      child.info('child_event', { action: 'create' });
      await child.flush();

      const log = await getLastLog(db);
      expect(log?.metadata).toEqual({
        requestId: 'req_123',
        action: 'create',
      });
    });

    it('nested children merge metadata', async () => {
      const logger = createLogger({ db });
      const child1 = logger.child({ requestId: 'req_123' });
      const child2 = child1.child({ userId: 'user_456' });

      child2.info('nested_event', { action: 'update' });
      await child2.flush();

      const log = await getLastLog(db);
      expect(log?.metadata).toEqual({
        requestId: 'req_123',
        userId: 'user_456',
        action: 'update',
      });
    });

    it('child metadata overwrites parent when keys conflict', async () => {
      const logger = createLogger({ db });
      const child = logger.child({ key: 'parent_value' });
      const grandchild = child.child({ key: 'child_value' });

      grandchild.info('conflict_event');
      await grandchild.flush();

      const log = await getLastLog(db);
      expect(log?.metadata.key).toBe('child_value');
    });

    it('siblings have isolated metadata', async () => {
      const logger = createLogger({ db });
      const child1 = logger.child({ branch: 'a' });
      const child2 = logger.child({ branch: 'b' });

      child1.info('event_a');
      child2.info('event_b');
      await child1.flush();
      await child2.flush();

      const logs = await getAllLogs(db);
      expect(logs).toHaveLength(2);
      expect(logs[0].metadata).toEqual({ branch: 'a' });
      expect(logs[1].metadata).toEqual({ branch: 'b' });
    });
  });

  describe('metadata', () => {
    it('handles empty metadata', async () => {
      const logger = createLogger({ db });

      logger.info('event_no_metadata');
      await logger.flush();

      const log = await getLastLog(db);
      expect(log?.metadata).toEqual({});
    });

    it('serializes complex metadata', async () => {
      const logger = createLogger({ db });

      logger.info('complex_event', {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        bool: true,
        null_val: null,
      });
      await logger.flush();

      const log = await getLastLog(db);
      expect(log?.metadata).toEqual({
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        bool: true,
        null_val: null,
      });
    });
  });

  describe('custom table name', () => {
    it('writes to custom table when specified', async () => {
      // Create custom table
      await db
        .prepare(
          `
        CREATE TABLE custom_logs (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          event_type TEXT NOT NULL,
          message TEXT,
          metadata TEXT,
          timestamp INTEGER NOT NULL
        )
      `,
        )
        .run();

      const logger = createLogger({ db, tableName: 'custom_logs' });

      logger.info('custom_event');
      await logger.flush();

      const result = await db.prepare('SELECT COUNT(*) as count FROM custom_logs').first<{
        count: number;
      }>();
      expect(result?.count).toBe(1);

      // Original logs table should be empty
      const mainCount = await getLogCount(db);
      expect(mainCount).toBe(0);

      // Cleanup
      await db.prepare('DROP TABLE custom_logs').run();
    });
  });

  describe('log entry structure', () => {
    it('generates unique IDs for each log', async () => {
      const logger = createLogger({ db });

      logger.info('event_1');
      logger.info('event_2');
      await logger.flush();

      const logs = await getAllLogs(db);
      expect(logs).toHaveLength(2);
      expect(logs[0].id).not.toBe(logs[1].id);
      expect(logs[0].id).toMatch(/^log_/);
    });

    it('includes timestamps', async () => {
      const logger = createLogger({ db });
      const before = Date.now();

      logger.info('timed_event');
      await logger.flush();

      const after = Date.now();
      const log = await getLastLog(db);

      expect(log?.timestamp).toBeGreaterThanOrEqual(before);
      expect(log?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('console-only mode', () => {
    it('does not persist logs when consoleOnly is true', async () => {
      const logger = createLogger({ consoleOnly: true });

      logger.info('console_event', { foo: 'bar' });
      logger.warn('console_warn');
      logger.error('console_error');
      await logger.flush();

      // Nothing should be written to D1
      const count = await getLogCount(db);
      expect(count).toBe(0);
    });

    it('child loggers inherit consoleOnly setting', async () => {
      const logger = createLogger({ consoleOnly: true });
      const child = logger.child({ requestId: 'req_123' });

      child.info('child_event');
      await child.flush();

      const count = await getLogCount(db);
      expect(count).toBe(0);
    });

    it('throws error if db is missing when consoleOnly is false', () => {
      expect(() => {
        createLogger({ consoleOnly: false });
      }).toThrow('LoggerConfig.db is required when consoleOnly is false');
    });

    it('does not require db when consoleOnly is true', () => {
      expect(() => {
        const logger = createLogger({ consoleOnly: true });
        logger.info('test');
      }).not.toThrow();
    });
  });

  describe('environment-aware logging', () => {
    it('test environment logs debug messages', async () => {
      const logger = createLogger({ db, environment: 'test' });
      logger.debug('debug_message', { data: 'test' });
      logger.info('info_message');
      await logger.flush();

      const count = await getLogCount(db);
      expect(count).toBe(1); // info persisted, debug only to console
    });

    it('development environment skips debug messages', async () => {
      const logger = createLogger({ db, environment: 'development' });
      logger.debug('debug_message');
      logger.info('info_message');
      logger.warn('warn_message');
      await logger.flush();

      const logs = await getAllLogs(db);
      expect(logs.length).toBe(2); // info and warn only
      expect(logs.some((l) => l.level === 'debug')).toBe(false);
    });

    it('production environment only logs warnings and errors', async () => {
      const logger = createLogger({ db, environment: 'production' });
      logger.debug('debug_message');
      logger.info('info_message');
      logger.warn('warn_message');
      logger.error('error_message');
      await logger.flush();

      const logs = await getAllLogs(db);
      expect(logs.length).toBe(2); // warn and error only
      expect(logs.map((l) => l.level)).toEqual(['warn', 'error']);
    });

    it('defaults to development environment', async () => {
      const logger = createLogger({ db }); // no environment specified
      logger.debug('debug_message');
      logger.info('info_message');
      await logger.flush();

      const logs = await getAllLogs(db);
      expect(logs.length).toBe(1); // info only (debug filtered out)
      expect(logs[0].level).toBe('info');
    });

    it('uses environment-specific buffer sizes', async () => {
      const testLogger = createLogger({ db, environment: 'test' });
      const prodLogger = createLogger({ db, environment: 'production' });

      // Test environment has larger buffer (1000)
      for (let i = 0; i < 60; i++) {
        testLogger.info(`test_${i}`);
      }
      let count = await getLogCount(db);
      expect(count).toBe(0); // Not flushed yet (buffer size 1000)

      // Production has smaller buffer (50)
      for (let i = 0; i < 60; i++) {
        prodLogger.warn(`prod_${i}`);
      }
      count = await getLogCount(db);
      expect(count).toBeGreaterThan(0); // Auto-flushed at 50
    });
  });
});
