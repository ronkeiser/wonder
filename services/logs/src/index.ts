import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { logs } from './schema';
import type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types';

export { createLogger } from './client';
export { Streamer } from './streamer';
export type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types';

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
  async fetch(): Promise<Response> {
    return new Response('Logs service - RPC only', { status: 200 });
  }

  /**
   * Internal method - writes log to D1 with console fallback
   */
  private write(context: LogContext, level: LogLevel, input: LoggerInput): void {
    const logEntry = {
      id: input.id || ulid(),
      timestamp: input.timestamp || Date.now(),
      level,
      ...context,
      ...input,
      message: input.message || input.event_type,
      metadata: JSON.stringify(input.metadata || {}),
    };

    // Write to D1 with console fallback (prevents infinite loops if D1 fails)
    this.ctx.waitUntil(
      this.db
        .insert(logs)
        .values(logEntry)
        .catch((e) => {
          console.error('[logs:fallback]', JSON.stringify({ level, ...context, ...input }), e);
        }),
    );

    // Best-effort WebSocket broadcast
    this.ctx.waitUntil(
      (async () => {
        const id = this.env.STREAMER.idFromName('logs-streamer');
        const stub = this.env.STREAMER.get(id);
        await stub.broadcast(logEntry);
      })().catch(() => {}),
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
