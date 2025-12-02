// services/logs/src/index.ts
import { WorkerEntrypoint } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { logs } from './db/schema.js';
import type { LogContext, Logger, LoggerInput } from './types.js';

/**
 * Main service
 */
export class LogsService extends WorkerEntrypoint<Env> {
  private db = drizzle(this.env.DB);

  /**
   * Factory method - returns a function with context baked in
   */
  newLogger(context: LogContext): Logger {
    return (input: LoggerInput) => {
      this.write(context, input);
    };
  }

  /**
   * RPC method - writes log to D1
   */
  write(context: LogContext, input: LoggerInput): void {
    console.log('CONTEXT:', context);
    console.log('INPUT:', input);
    this.ctx.waitUntil(
      (async () => {
        await this.db.insert(logs).values({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          ...context,
          ...input,
          metadata: JSON.stringify(input.metadata || {}),
        });
      })(),
    );
  }
}

export default LogsService;
