import type { NextFunction, Request, Response } from 'express';
import { recurringPaymentService } from '../services/recurring-payment.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class RecurringPaymentController {
  async detect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      await recurringPaymentService.detect(req.user.userId);
      sendSuccess(res, null, 'Recurring payments detected successfully');
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const payments = await recurringPaymentService.list(req.user.userId, req.query.status as string | undefined);
      sendSuccess(res, { recurringPayments: payments, recurring_payments: payments }, 'Recurring payments retrieved successfully');
    } catch (error) { next(error); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const payment = await recurringPaymentService.getById(id, req.user.userId);
      sendSuccess(res, { recurringPayment: payment, recurring_payment: payment }, 'Recurring payment retrieved successfully');
    } catch (error) { next(error); }
  }

  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const payment = await recurringPaymentService.confirm(id, req.user.userId);
      sendSuccess(res, { recurringPayment: payment, recurring_payment: payment }, 'Recurring payment confirmed successfully');
    } catch (error) { next(error); }
  }

  async dismiss(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const payment = await recurringPaymentService.dismiss(id, req.user.userId);
      sendSuccess(res, { recurringPayment: payment, recurring_payment: payment }, 'Recurring payment dismissed successfully');
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const payment = await recurringPaymentService.create(req.user.userId, req.body);
      sendSuccess(res, { recurringPayment: payment, recurring_payment: payment }, 'Recurring payment created successfully', 201);
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await recurringPaymentService.delete(id, req.user.userId);
      sendSuccess(res, null, 'Recurring payment deleted successfully');
    } catch (error) { next(error); }
  }
}

export const recurringPaymentController = new RecurringPaymentController();