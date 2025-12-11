import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { logs } from './db/schema.js';
import type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types.js';

export { createLogger } from './client.js';
export { Streamer } from './streamer';
export type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types.js';

/**
 * Helper to normalize logger input
 */
function normalizeInput(input: LoggerInput | string): LoggerInput {
  return typeof input === 'string' ? { message: input } : input;
}

/**
 * Main service
 */
export class LogsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * HTTP entrypoint
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Route to Streamer DO for UI and WebSocket connections
    if (url.pathname === '/' || url.pathname === '/stream') {
      const id = this.env.STREAMER.idFromName('logs-streamer');
      const stub = this.env.STREAMER.get(id);
      return stub.fetch(request);
    }

    return new Response('Logs service - RPC only', { status: 200 });
  }

  /**
   * Internal method - writes log to D1
   */
  private write(context: LogContext, level: LogLevel, input: LoggerInput): void {
    this.ctx.waitUntil(
      (async () => {
        const logEntry = {
          id: input.id || ulid(), // Use client-provided ID, fallback to generating one
          timestamp: input.timestamp || Date.now(), // Use client-provided timestamp
          level,
          ...context,
          ...input,
          metadata: JSON.stringify(input.metadata || {}),
        };

        await this.db.insert(logs).values(logEntry);

        // Broadcast to connected WebSocket clients
        try {
          const id = this.env.STREAMER.idFromName('logs-streamer');
          const stub = this.env.STREAMER.get(id);
          await stub.broadcast(logEntry);
        } catch (error) {
          console.error('Failed to broadcast log to WebSocket clients:', error);
        }
      })(),
    );
  }

  /**
   * RPC method - generic log method that accepts level
   */
  log(level: LogLevel, context: LogContext, input: LoggerInput | string): void {
    this.write(context, level, normalizeInput(input));
  }

  /**
   * RPC method - logs error level message
   */
  error(context: LogContext, input: LoggerInput | string): void {
    this.write(context, 'error', normalizeInput(input));
  }

  /**
   * RPC method - logs warn level message
   */
  warn(context: LogContext, input: LoggerInput | string): void {
    this.write(context, 'warn', normalizeInput(input));
  }

  /**
   * RPC method - logs info level message
   */
  info(context: LogContext, input: LoggerInput | string): void {
    this.write(context, 'info', normalizeInput(input));
  }

  /**
   * RPC method - logs debug level message
   */
  debug(context: LogContext, input: LoggerInput | string): void {
    this.write(context, 'debug', normalizeInput(input));
  }

  /**
   * RPC method - logs fatal level message
   */
  fatal(context: LogContext, input: LoggerInput | string): void {
    this.write(context, 'fatal', normalizeInput(input));
  }

  /**
   * RPC method - retrieves logs from D1
   */
  async getLogs(options: GetLogsOptions = {}) {
    const conditions = [];

    if (options.service) conditions.push(eq(logs.service, options.service));
    if (options.level) conditions.push(eq(logs.level, options.level));
    if (options.event_type) conditions.push(eq(logs.event_type, options.event_type));
    if (options.trace_id) conditions.push(eq(logs.trace_id, options.trace_id));
    if (options.request_id) conditions.push(eq(logs.request_id, options.request_id));
    if (options.workspace_id) conditions.push(eq(logs.workspace_id, options.workspace_id));
    if (options.project_id) conditions.push(eq(logs.project_id, options.project_id));
    if (options.user_id) conditions.push(eq(logs.user_id, options.user_id));

    const limit = options.limit || 100;

    const results = await this.db
      .select()
      .from(logs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(logs.timestamp))
      .limit(limit);

    return { logs: results };
  }
}

export default LogsService;
