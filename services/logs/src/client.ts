import { ulid } from 'ulid';
import type { LogContext, Logger, LoggerInput, LogLevel } from './types.js';

/**
 * Create a logger instance that wraps the LOGS service binding
 * Works with both Workers (ExecutionContext) and Durable Objects (DurableObjectState)
 */
export function createLogger(
  ctx: { waitUntil(promise: Promise<any>): void },
  logsBinding: {
    log(level: LogLevel, context: LogContext, input: LoggerInput): Promise<void>;
  },
  logContext: LogContext,
): Logger {
  const log = (level: LogLevel, input: LoggerInput | string) => {
    const normalizedInput = typeof input === 'string' ? { message: input } : input;
    const logEntry: LoggerInput = {
      id: ulid(),
      timestamp: Date.now(),
      ...normalizedInput,
    };
    ctx.waitUntil(logsBinding.log(level, logContext, logEntry));
  };

  return {
    info: (input) => log('info', input),
    warn: (input) => log('warn', input),
    error: (input) => log('error', input),
    debug: (input) => log('debug', input),
    fatal: (input) => log('fatal', input),
  };
}
