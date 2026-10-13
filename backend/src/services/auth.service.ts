import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../errors/app-error.js';
import { userRepository, type SafeUser, type User } from '../repositories/user.repository.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sessionService } from './session.service.js';

export interface RegisterDTO {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  baseCurrency?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: AuthTokens;
}

function sanitizeUser(user: User): SafeUser {
  const { passwordHash: _excluded, ...safe } = user;
  return safe;
}

export class AuthService {
  async register(
    data: RegisterDTO,
    metadata?: { userAgent?: string; ip?: string },
  ): Promise<AuthResult> {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await userRepository.createUser({
      email: data.email,
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      baseCurrency: data.baseCurrency,
    });

    const sessionId = await sessionService.createSession(user.id, metadata);
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, sessionId });

    return {
      user: sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  async login(data: LoginDTO, metadata?: { userAgent?: string; ip?: string }): Promise<AuthResult> {
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Account is inactive');
    }

    const isMatch = await comparePassword(data.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const sessionId = await sessionService.createSession(user.id, metadata);
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, sessionId });

    return {
      user: sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  async refreshToken(
    refreshTokenStr: string,
    metadata?: { userAgent?: string; ip?: string },
  ): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshTokenStr);

    const isValidSession = await sessionService.validateSession(payload.userId, payload.sessionId);

    if (!isValidSession) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    const user = await userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User no longer exists or is inactive');
    }

    // Rotate refresh token: revoke current session and issue new session
    await sessionService.revokeSession(payload.userId, payload.sessionId);
    const newSessionId = await sessionService.createSession(user.id, metadata);

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({
      userId: user.id,
      sessionId: newSessionId,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async logout(userId: string, refreshTokenStr?: string): Promise<void> {
    if (refreshTokenStr) {
      try {
        const payload = verifyRefreshToken(refreshTokenStr);
        if (payload.userId === userId) {
          await sessionService.revokeSession(userId, payload.sessionId);
          return;
        }
      } catch {
        // Fall back to revoking all sessions if token verification fails
      }
    }

    await sessionService.revokeAllUserSessions(userId);
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return sanitizeUser(user);
  }
}

export const authService = new AuthService();
