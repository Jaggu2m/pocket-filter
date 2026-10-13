import type { NextFunction, Request, Response } from 'express';
import { accountService } from '../services/account.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';
import type { AccountType } from '../repositories/account.repository.js';

export class AccountController {
  async createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const account = await accountService.createAccount(req.user.userId, req.body);
      sendSuccess(res, { account }, 'Financial account created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async listAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const options = {
        type: req.query.type as AccountType | undefined,
        includeArchived: req.query.includeArchived === 'true',
      };

      const accounts = await accountService.listAccounts(req.user.userId, options);
      sendSuccess(res, { accounts }, 'Accounts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const summary = await accountService.getAccountSummary(req.user.userId);
      sendSuccess(res, { summary }, 'Account summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAccountById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const account = await accountService.getAccountById(id, req.user.userId);
      sendSuccess(res, { account }, 'Account retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const account = await accountService.updateAccount(id, req.user.userId, req.body);
      sendSuccess(res, { account }, 'Account updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async archiveAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const account = await accountService.archiveAccount(id, req.user.userId);
      sendSuccess(res, { account }, 'Account archived successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await accountService.deleteAccount(id, req.user.userId);
      sendSuccess(res, null, 'Account deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const accountController = new AccountController();
