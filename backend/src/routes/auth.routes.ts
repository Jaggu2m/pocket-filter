import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
} from '../schemas/auth.schema.js';

const authRouter = Router();

authRouter.post('/register', validateRequest({ body: registerSchema }), authController.register);

authRouter.post('/login', validateRequest({ body: loginSchema }), authController.login);

authRouter.post('/refresh', validateRequest({ body: refreshTokenSchema }), authController.refresh);

authRouter.post(
  '/logout',
  authenticate,
  validateRequest({ body: logoutSchema }),
  authController.logout,
);

authRouter.get('/profile', authenticate, authController.getProfile);

authRouter.patch(
  '/profile',
  authenticate,
  validateRequest({ body: updateProfileSchema }),
  authController.updateProfile,
);

export default authRouter;
