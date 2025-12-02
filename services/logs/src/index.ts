import { WorkerEntrypoint } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { logs } from './db/schema.js';
import type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types.js';

export { Streamer } from './streamer';
export type { GetLogsOptions, LogContext, LogLevel, Logger, LoggerInput } from './types.js';

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

    if (url.pathname === '/logs') {
      const options: GetLogsOptions = {
        service: url.searchParams.get('service') || undefined,
        level: (url.searchParams.get('level') as LogLevel) || undefined,
        event_type: url.searchParams.get('event_type') || undefined,
        trace_id: url.searchParams.get('trace_id') || undefined,
        request_id: url.searchParams.get('request_id') || undefined,
        workspace_id: url.searchParams.get('workspace_id') || undefined,
        project_id: url.searchParams.get('project_id') || undefined,
        user_id: url.searchParams.get('user_id') || undefined,
        limit: url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
      };

      const results = await this.getLogs(options);
      return Response.json(results);
    }

    return new Response('Logs service', { status: 200 });
  }

  /**
   * Factory method - returns a function with context baked in
   */
  newLogger(context: LogContext): Logger {
    const normalizeInput = (input: LoggerInput | string): LoggerInput => {
      return typeof input === 'string' ? { message: input } : input;
    };

    return {
      error: (input: LoggerInput | string) => {
        this.write(context, 'error', normalizeInput(input));
      },
      warn: (input: LoggerInput | string) => {
        this.write(context, 'warn', normalizeInput(input));
      },
      info: (input: LoggerInput | string) => {
        this.write(context, 'info', normalizeInput(input));
      },
      debug: (input: LoggerInput | string) => {
        this.write(context, 'debug', normalizeInput(input));
      },
      fatal: (input: LoggerInput | string) => {
        this.write(context, 'fatal', normalizeInput(input));
      },
    };
  }

  /**
   * RPC method - writes log to D1
   */
  write(context: LogContext, level: LogLevel, input: LoggerInput): void {
    this.ctx.waitUntil(
      (async () => {
        const logEntry = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
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

    return { logs: [...results] };
  }
}

export default LogsService;
