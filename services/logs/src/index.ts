// services/logs/src/index.ts
import { WorkerEntrypoint } from 'cloudflare:workers';

// Type definitions
export interface LogContext {
  service: string;
  environment: string;
  version?: string;
  instance_id?: string;
}

export interface LogEntry {
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

export interface FullLogEntry extends LogEntry, LogContext {
  id: string;
  timestamp: number;
}

// Logger wrapper with baked-in context
export class Logger {
  constructor(private service: LogsService, private context: LogContext) {}

  async write(entry: LogEntry): Promise<void> {
    return this.service.write({ ...this.context, ...entry });
  }
}

// Main service
export class LogsService extends WorkerEntrypoint<Env> {
  // Factory method - returns Logger with context
  newLogger(context: LogContext): Logger {
    return new Logger(this, context);
  }

  // RPC method - writes log to D1
  async write(entry: LogEntry & Partial<LogContext>): Promise<void> {
    const fullEntry: FullLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      service: entry.service || 'unknown',
      environment: entry.environment || 'unknown',
      version: entry.version,
      instance_id: entry.instance_id,
      level: entry.level,
      event_type: entry.event_type,
      message: entry.message,
      source_location: entry.source_location,
      trace_id: entry.trace_id,
      request_id: entry.request_id,
      workspace_id: entry.workspace_id,
      project_id: entry.project_id,
      user_id: entry.user_id,
      metadata: entry.metadata || {},
    };

    // TODO: Insert into D1
    // await this.env.DB.prepare('INSERT INTO logs ...').bind(...).run();

    // For now, just log to console
    console.log('[LOGS]', JSON.stringify(fullEntry));
  }
}

export default LogsService;
