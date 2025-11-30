/** Custom error classes for business logic errors */

export class ValidationError extends Error {
  constructor(message: string, public path: string, public code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string, public entity: string, public id: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Extract meaningful error message from Drizzle/D1 errors
 */
export function extractDbError(error: unknown): {
  message: string;
  constraint?: string;
  field?: string;
} {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const message = error.message;

  // D1/SQLite constraint violations
  if (message.includes('UNIQUE constraint failed:')) {
    const match = message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
    if (match) {
      return {
        message: `Duplicate value for ${match[2]}`,
        constraint: 'unique',
        field: match[2],
      };
    }
  }

  if (message.includes('NOT NULL constraint failed:')) {
    const match = message.match(/NOT NULL constraint failed: (\w+)\.(\w+)/);
    if (match) {
      return {
        message: `Missing required field: ${match[2]}`,
        constraint: 'not_null',
        field: match[2],
      };
    }
  }

  if (message.includes('FOREIGN KEY constraint failed')) {
    return {
      message: 'Referenced record does not exist',
      constraint: 'foreign_key',
    };
  }

  if (message.includes('CHECK constraint failed')) {
    return {
      message: 'Value does not meet validation requirements',
      constraint: 'check',
    };
  }

  // Generic "Failed query" from Drizzle - try to extract more details
  if (message.includes('Failed query:')) {
    const lines = message.split('\n');
    if (lines.length > 1) {
      return { message: lines[0] };
    }
  }

  return { message };
}

/**
 * Wrap an async operation with better error handling
 */
export async function withDbErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const dbError = extractDbError(error);
    const enhancedMessage = `${context}: ${dbError.message}`;

    const enhancedError = new Error(enhancedMessage);
    (enhancedError as any).constraint = dbError.constraint;
    (enhancedError as any).field = dbError.field;
    (enhancedError as any).originalError = error;

    throw enhancedError;
  }
}
