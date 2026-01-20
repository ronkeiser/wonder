/**
 * HTTP service error classes
 * These are recognized by the error handler middleware
 */

export class NotFoundError extends Error {
  constructor(
    message: string,
    public readonly resourceType?: string,
    public readonly resourceId?: string,
  ) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
