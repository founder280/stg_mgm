export class ApiError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, message, 'NOT_FOUND');
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, 'CONFLICT', details);
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, message, 'UNPROCESSABLE', details);
  }
}
