import type { Request, Response, NextFunction } from 'express';
import { copilotService } from './copilot.service.js';
import { sendSuccess } from '../../utils/response.js';
import { UnauthorizedError } from '../../errors/app-error.js';

export class CopilotController {
  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await copilotService.chat(req.user.userId, req.body);
      sendSuccess(res, result, 'Copilot response generated successfully');
    } catch (error) {
      next(error);
    }
  }

  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const conversations = await copilotService.listConversations(req.user.userId);
      sendSuccess(res, { conversations }, 'Conversations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await copilotService.getConversation(req.user.userId, id);
      sendSuccess(res, result, 'Conversation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await copilotService.deleteConversation(req.user.userId, id);
      sendSuccess(res, result, 'Conversation deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const copilotController = new CopilotController();
