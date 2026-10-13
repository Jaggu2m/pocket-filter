import type { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export function sendSuccess<T>(res: Response, data?: T, message?: string, statusCode = 200): void {
  const payload: ApiResponse<T> = {
    success: true,
    ...(message ? { message } : {}),
    ...(data !== undefined ? { data } : {}),
  };

  res.status(statusCode).json(payload);
}
