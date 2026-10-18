import type { NextFunction, Request, Response } from 'express';
import { statementService } from '../services/statement.service.js';
import { sendSuccess } from '../utils/response.js';
import { BadRequestError, UnauthorizedError } from '../errors/app-error.js';

export class StatementController {
  async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      let fileBuffer: Buffer | null = req.file?.buffer || null;
      let originalName = req.file?.originalname || req.body?.fileName || 'statement.pdf';

      if (!fileBuffer && req.body?.base64) {
        const rawBase64 = typeof req.body.base64 === 'string'
          ? req.body.base64.replace(/^data:[^;]+;base64,/, '')
          : '';
        fileBuffer = Buffer.from(rawBase64, 'base64');
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        throw new BadRequestError('Statement file is required (Upload as multipart "file" or JSON "base64")');
      }

      const accountId = req.body?.accountId || (req.query?.accountId as string | undefined);
      const result = await statementService.previewStatement(
        req.user.userId,
        fileBuffer,
        originalName,
        accountId,
      );

      sendSuccess(res, result, 'Statement parsed and preview generated');
    } catch (error) {
      next(error);
    }
  }

  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const result = await statementService.confirmImport(req.user.userId, req.body);
      sendSuccess(res, result, 'Statement transactions imported successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const history = await statementService.getImportHistory(req.user.userId);
      sendSuccess(res, { history }, 'Statement import history retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const statementController = new StatementController();
