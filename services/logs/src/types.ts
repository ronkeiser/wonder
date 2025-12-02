// services/logs/src/types.ts

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  service: string;
  environment: string;
  version?: string;
  instance_id?: string;
}

export interface LoggerInput {
  event_type?: string;
  message?: string;
  source_location?: string;
  trace_id?: string;
  request_id?: string;
  workspace_id?: string;
  project_id?: string;
  user_id?: string;
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
  metadata: string;
}

export interface Logger {
  error(input: LoggerInput | string): void;
  warn(input: LoggerInput | string): void;
  info(input: LoggerInput | string): void;
  debug(input: LoggerInput | string): void;
}
