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
  instance_id?: string;
}

export interface LoggerInput {
  id?: string;
  timestamp?: number;
  event_type?: string;
  message?: string;
  source_location?: string;
  trace_id?: string;
  request_id?: string;
  workspace_id?: string;
  project_id?: string;
  user_id?: string;
  highlight?: HighlightColor;
  metadata?: Record<string, unknown>;
}

export interface LogEntry extends LogContext {
  id: string;
  timestamp: number;
  level: LogLevel;
  event_type: string;
  message?: string;
  source_location?: string;
  trace_id?: string;
  request_id?: string;
  workspace_id?: string;
  project_id?: string;
  user_id?: string;
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
  event_type?: string;
  trace_id?: string;
  request_id?: string;
  workspace_id?: string;
  project_id?: string;
  user_id?: string;
  limit?: number;
}
