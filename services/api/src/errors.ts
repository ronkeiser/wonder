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
