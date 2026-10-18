import { Router } from 'express';
import { accountController } from '../controllers/account.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  createAccountSchema,
  updateAccountSchema,
  accountQuerySchema,
} from '../schemas/account.schema.js';

const accountRouter = Router();

// All account routes require authentication
accountRouter.use(authenticate);

accountRouter.post(
  '/',
  validateRequest({ body: createAccountSchema }),
  accountController.createAccount,
);

accountRouter.get(
  '/',
  validateRequest({ query: accountQuerySchema }),
  accountController.listAccounts,
);

// Note: Summary and unspecified-balance routes must precede parameterized /:id route
accountRouter.get('/summary', accountController.getSummary);
accountRouter.patch('/unspecified-balance', accountController.updateUnspecifiedBalance);

accountRouter.get('/:id', accountController.getAccountById);

accountRouter.patch(
  '/:id',
  validateRequest({ body: updateAccountSchema }),
  accountController.updateAccount,
);

accountRouter.post('/:id/archive', accountController.archiveAccount);

accountRouter.delete('/:id', accountController.deleteAccount);

export default accountRouter;
