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
  let lastTimestamp = 0;
  let sequence = 0;

  const log = (level: LogLevel, input: LoggerInput | string) => {
    const normalizedInput = typeof input === 'string' ? { message: input } : input;

    // Get current timestamp
    const now = Date.now();

    // If same millisecond as last log, increment sequence counter
    // Otherwise reset sequence to 0
    if (now === lastTimestamp) {
      sequence++;
    } else {
      sequence = 0;
      lastTimestamp = now;
    }

    // Add sequence as fractional component (0.001, 0.002, etc.)
    const preciseTimestamp = now + sequence * 0.001;

    const logEntry: LoggerInput = {
      id: ulid(),
      timestamp: preciseTimestamp,
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
