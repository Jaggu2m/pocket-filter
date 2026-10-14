import type { NextFunction, Request, Response } from 'express';
import { transactionService } from '../services/transaction.service.js';
import { goalImpactService } from '../services/goal-impact.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';
import type { TransactionFilterOptions } from '../repositories/transaction.repository.js';

export class TransactionController {
  async createTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const transaction = await transactionService.createTransaction(req.user.userId, req.body);
      let goalImpacts: any[] = [];
      if (transaction.type === 'expense') {
        try {
          goalImpacts = await goalImpactService.calculateImpactsForTransaction(
            req.user.userId,
            transaction.amount,
            transaction.date,
          );
        } catch (_error) {
          goalImpacts = [];
        }
      }
      sendSuccess(res, { transaction, goalImpacts }, 'Transaction created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async listTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const filterOptions: TransactionFilterOptions = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        type: req.query.type as TransactionFilterOptions['type'],
        category: req.query.category as string | undefined,
        accountId: req.query.accountId as string | undefined,
        search: req.query.search as string | undefined,
        sortBy: req.query.sortBy as TransactionFilterOptions['sortBy'],
        sortOrder: req.query.sortOrder as TransactionFilterOptions['sortOrder'],
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const result = await transactionService.listTransactions(req.user.userId, filterOptions);
      sendSuccess(res, result, 'Transactions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTransactionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const transaction = await transactionService.getTransactionById(id, req.user.userId);
      sendSuccess(res, { transaction }, 'Transaction retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const transaction = await transactionService.updateTransaction(id, req.user.userId, req.body);
      sendSuccess(res, { transaction }, 'Transaction updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await transactionService.deleteTransaction(id, req.user.userId);
      sendSuccess(res, null, 'Transaction deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const transactionController = new TransactionController();
