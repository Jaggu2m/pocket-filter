import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metadata = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.register(req.body, metadata);
      sendSuccess(res, result, 'User registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metadata = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.login(req.body, metadata);
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metadata = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const tokens = await authService.refreshToken(req.body.refreshToken, metadata);
      sendSuccess(res, tokens, 'Tokens refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      await authService.logout(req.user.userId, req.body?.refreshToken);
      sendSuccess(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const user = await authService.getProfile(req.user.userId);
      sendSuccess(res, { user }, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const updated = await userRepository.updateUser(req.user.userId, req.body);
      if (!updated) {
        throw new UnauthorizedError('User not found');
      }

      const { passwordHash: _hash, ...safeUser } = updated;
      sendSuccess(res, { user: safeUser }, 'User profile updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
