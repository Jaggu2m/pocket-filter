import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    return next(err);
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Handle SyntaxError (e.g. invalid JSON payload)
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Malformed JSON payload in request body',
    });
    return;
  }

  // Handle PostgreSQL unique constraint violations (23505)
  if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') {
    res.status(409).json({
      success: false,
      code: 'CONFLICT',
      message: 'A record with this information already exists',
    });
    return;
  }

  // Unhandled / Internal Server Errors
  console.error('Unhandled Exception:', err);

  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message:
      env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : err instanceof Error
          ? err.message
          : 'Internal server error',
  });
}
