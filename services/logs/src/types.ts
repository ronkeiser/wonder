// services/logs/src/types.ts

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'fatal';

export type HighlightColor =
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'lime'
  | 'orange'
  | 'yellow'
  | 'red'
  | 'green'
  | 'blue'
  | 'magenta';

export interface LogContext {
  service: string;
  environment: string;
  version?: string;
  instanceId?: string;
}

export interface LoggerInput {
  id?: string;
  timestamp?: number;
  eventType?: string;
  message?: string;
  sourceLocation?: string;
  traceId?: string;
  requestId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  highlight?: HighlightColor;
  metadata?: Record<string, unknown>;
}

export interface LogEntry extends LogContext {
  id: string;
  timestamp: number;
  level: LogLevel;
  eventType: string;
  message?: string;
  sourceLocation?: string;
  traceId?: string;
  requestId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  highlight?: string;
  metadata: string;
}

export interface Logger {
  error(input: LoggerInput | string): void;
  warn(input: LoggerInput | string): void;
  info(input: LoggerInput | string): void;
  debug(input: LoggerInput | string): void;
  fatal(input: LoggerInput | string): void;
}

export interface GetLogsOptions {
  service?: string;
  level?: LogLevel;
  eventType?: string;
  traceId?: string;
  requestId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  limit?: number;
}
