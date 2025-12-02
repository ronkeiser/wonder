// services/logs/src/types.ts

export interface LogContext {
  service: string;
  environment: string;
  version?: string;
  instance_id?: string;
}

export interface LoggerInput {
  level: 'error' | 'warn' | 'info' | 'debug';
  event_type: string;
  message?: string;
  source_location?: string;
  trace_id?: string;
  request_id?: string;
  workspace_id?: string;
  project_id?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface LogEntry extends LoggerInput, LogContext {
  id: string;
  timestamp: number;
}

export type Logger = (input: LoggerInput) => void;
