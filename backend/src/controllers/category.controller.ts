import type { NextFunction, Request, Response } from 'express';
import { categoryService } from '../services/category.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class CategoryController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const [categories, rules] = await Promise.all([
        categoryService.listCategories(),
        categoryService.listRules(req.user.userId),
      ]);
      sendSuccess(res, { categories, rules }, 'Categories retrieved successfully');
    } catch (error) { next(error); }
  }

  async saveRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const rule = await categoryService.saveRule(req.user.userId, req.body.merchant, req.body.category);
      sendSuccess(res, { rule }, 'Merchant categorization rule saved', 201);
    } catch (error) { next(error); }
  }

  async correctTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const assignment = await categoryService.correctTransaction(req.user.userId, id, req.body.category, req.body.learn);
      sendSuccess(res, { assignment }, 'Transaction category corrected');
    } catch (error) { next(error); }
  }

  async recategorize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await categoryService.recategorize(req.user.userId);
      sendSuccess(res, result, 'Transactions recategorized successfully');
    } catch (error) { next(error); }
  }
}

export const categoryController = new CategoryController();
