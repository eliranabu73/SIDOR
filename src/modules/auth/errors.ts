import { HttpError } from '../../shared/errors.js';

/**
 * 401 Unauthorized — token missing, malformed, expired, or fails signature.
 */
export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden — token is valid but the caller lacks permission.
 */
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}
