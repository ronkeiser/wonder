export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type Environment = 'test' | 'development' | 'production';

export interface EnvironmentConfig {
  minLevel: LogLevel;
  includeStackTraces: boolean;
  bufferSize: number;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  event_type: string;
  message?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface Logger {
  /**
   * Create a child logger with additional metadata merged in.
   * Child loggers inherit all parent metadata.
   */
  child(metadata: Record<string, unknown>): Logger;

  /**
   * Log at debug level (console only, not persisted to D1)
   */
  debug(event_type: string, metadata?: Record<string, unknown>): void;

  /**
   * Log at info level
   */
  info(event_type: string, metadata?: Record<string, unknown>): void;

  /**
   * Log at warn level
   */
  warn(event_type: string, metadata?: Record<string, unknown>): void;

  /**
   * Log at error level
   */
  error(event_type: string, metadata?: Record<string, unknown>): void;

  /**
   * Log at fatal level (immediately flushes and can trigger alerts)
   */
  fatal(event_type: string, metadata?: Record<string, unknown>): void;

  /**
   * Flush buffered log entries to D1
   */
  flush(): Promise<void>;
}

export interface LoggerConfig {
  db?: D1Database;
  bufferSize?: number;
  tableName?: string;
  consoleOnly?: boolean;
  environment?: Environment;
}
