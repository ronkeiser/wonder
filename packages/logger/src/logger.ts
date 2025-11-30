/** Unified logger with optional D1 persistence */

import type {
  Environment,
  EnvironmentConfig,
  LogEntry,
  Logger,
  LoggerConfig,
  LogLevel,
} from './types.js';

const DEFAULT_TABLE_NAME = 'logs';

/** Environment-specific configurations */
const ENVIRONMENT_CONFIGS: Record<Environment, EnvironmentConfig> = {
  test: {
    minLevel: 'debug', // Log everything in tests
    includeStackTraces: true,
    bufferSize: 1000, // Large buffer, flush less often
  },
  development: {
    minLevel: 'info', // Skip debug logs
    includeStackTraces: true,
    bufferSize: 50,
  },
  production: {
    minLevel: 'warn', // Only warnings and errors
    includeStackTraces: false,
    bufferSize: 50,
  },
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class LoggerImpl implements Logger {
  protected metadata: Record<string, unknown>;
  private buffer: LogEntry[] = [];
  private db?: D1Database;
  private bufferSize: number;
  private tableName: string;
  private consoleOnly: boolean;
  private environment: Environment;
  private envConfig: EnvironmentConfig;

  constructor(config: LoggerConfig, parentMetadata: Record<string, unknown> = {}) {
    this.metadata = parentMetadata;
    this.db = config.db;
    this.tableName = config.tableName ?? DEFAULT_TABLE_NAME;
    this.consoleOnly = config.consoleOnly ?? false;
    this.environment = config.environment ?? 'development';
    this.envConfig = ENVIRONMENT_CONFIGS[this.environment];
    this.bufferSize = config.bufferSize ?? this.envConfig.bufferSize;

    // Validate: if not console-only, db is required
    if (!this.consoleOnly && !this.db) {
      throw new Error('LoggerConfig.db is required when consoleOnly is false');
    }
  }

  child(metadata: Record<string, unknown>): Logger {
    return new LoggerImpl(
      {
        db: this.db,
        bufferSize: this.bufferSize,
        tableName: this.tableName,
        consoleOnly: this.consoleOnly,
        environment: this.environment,
      },
      { ...this.metadata, ...metadata },
    );
  }

  debug(event_type: string, metadata?: Record<string, unknown>): void {
    this.log('debug', event_type, metadata);
  }

  info(event_type: string, metadata?: Record<string, unknown>): void {
    this.log('info', event_type, metadata);
  }

  warn(event_type: string, metadata?: Record<string, unknown>): void {
    this.log('warn', event_type, metadata);
  }

  error(event_type: string, metadata?: Record<string, unknown>): void {
    this.log('error', event_type, metadata);
  }

  fatal(event_type: string, metadata?: Record<string, unknown>): void {
    this.log('fatal', event_type, metadata);
    // Fatal logs flush immediately (don't wait for batch)
    this.flush().catch((err) => {
      console.error('Failed to flush fatal log:', err);
    });
  }

  private log(level: LogLevel, event_type: string, metadata?: Record<string, unknown>): void {
    // Check if this log level should be emitted based on environment config
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.envConfig.minLevel]) {
      return; // Skip logs below minimum level
    }

    const entry: LogEntry = {
      id: this.generateId(),
      level,
      event_type,
      metadata: { ...this.metadata, ...metadata },
      timestamp: Date.now(),
    };

    // Always log to console for wrangler tail
    this.logToConsole(level, event_type, metadata);

    // Buffer for D1 only if not console-only mode (skip debug level)
    if (!this.consoleOnly && level !== 'debug') {
      this.buffer.push(entry);

      // Auto-flush on buffer threshold
      if (this.buffer.length >= this.bufferSize) {
        this.flush().catch((err) => {
          console.error('Failed to auto-flush logs:', err);
        });
      }
    }
  }

  async flush(): Promise<void> {
    // No-op for console-only mode or if no buffer
    if (this.consoleOnly || !this.db || this.buffer.length === 0) {
      return;
    }

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      // Batch insert all buffered entries
      const statements = toFlush.map((entry) =>
        this.db!.prepare(
          `INSERT INTO ${this.tableName} (id, level, event_type, message, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          entry.id,
          entry.level,
          entry.event_type,
          null, // message field (optional, can be extracted from metadata)
          JSON.stringify(entry.metadata),
          entry.timestamp,
        ),
      );

      await this.db!.batch(statements);
    } catch (err) {
      // On failure, log to console but don't re-throw
      // (prevents cascading failures in request handlers)
      console.error('Failed to flush logs to D1:', err, {
        entries: toFlush.length,
      });
    }
  }

  protected logToConsole(
    level: LogLevel,
    event_type: string,
    metadata?: Record<string, unknown>,
  ): void {
    const logData = {
      level,
      event_type,
      metadata: { ...this.metadata, ...metadata },
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(logData));
  }

  protected generateId(): string {
    // Simple ID generation: timestamp + random suffix
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `log_${timestamp}_${random}`;
  }
}

export function createLogger(config: LoggerConfig): Logger {
  return new LoggerImpl(config);
}
