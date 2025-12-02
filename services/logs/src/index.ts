import { WorkerEntrypoint } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { logs } from './db/schema.js';
import type { LogContext, LogLevel, Logger, LoggerInput } from './types.js';

/**
 * Main service
 */
export class LogsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * HTTP entrypoint
   */
  async fetch(): Promise<Response> {
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
        await this.db.insert(logs).values({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          level,
          ...context,
          ...input,
          metadata: JSON.stringify(input.metadata || {}),
        });
      })(),
    );
  }
}

export default LogsService;
