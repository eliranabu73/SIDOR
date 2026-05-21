export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ConflictError extends HttpError {
  constructor(code: string, message: string, details?: unknown) {
    super(409, code, message, details);
  }
}

export class ValidationFailedError extends HttpError {
  constructor(code: string, message: string, details?: unknown) {
    super(422, code, message, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}
