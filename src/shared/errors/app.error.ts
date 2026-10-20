export type StatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: StatusCode = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado", code = "NOT_FOUND") {
    super(code, message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown, code = "VALIDATION_ERROR") {
    super(code, message, 422, details);
  }
}