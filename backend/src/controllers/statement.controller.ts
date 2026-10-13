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

      if (!req.file) {
        throw new BadRequestError('Statement file is required (Upload as field "file")');
      }

      const accountId = req.body.accountId || (req.query.accountId as string | undefined);
      const result = await statementService.previewStatement(
        req.user.userId,
        req.file.buffer,
        req.file.originalname,
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
