import type { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    const statusBadge =
      statusCode >= 500
        ? `\x1b[31m${statusCode}\x1b[0m`
        : statusCode >= 400
          ? `\x1b[33m${statusCode}\x1b[0m`
          : statusCode >= 300
            ? `\x1b[36m${statusCode}\x1b[0m`
            : `\x1b[32m${statusCode}\x1b[0m`;

    console.log(
      `[${timestamp}] ${method} ${originalUrl} ${statusBadge} ${duration}ms - ${ip || 'unknown'}`,
    );
  });

  next();
}
