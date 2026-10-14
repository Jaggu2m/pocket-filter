import { Router } from 'express';
import { transactionController } from '../controllers/transaction.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  createTransactionSchema,
  updateTransactionSchema,
  transactionQuerySchema,
} from '../schemas/transaction.schema.js';
import { categoryController } from '../controllers/category.controller.js';
import { correctTransactionCategorySchema } from '../schemas/category.schema.js';

const transactionRouter = Router();

transactionRouter.use(authenticate);

transactionRouter.post(
  '/',
  validateRequest({ body: createTransactionSchema }),
  transactionController.createTransaction,
);

transactionRouter.get(
  '/',
  validateRequest({ query: transactionQuerySchema }),
  transactionController.listTransactions,
);

transactionRouter.get('/:id', transactionController.getTransactionById);

transactionRouter.patch(
  '/:id/category',
  validateRequest({ body: correctTransactionCategorySchema }),
  categoryController.correctTransaction,
);

transactionRouter.patch(
  '/:id',
  validateRequest({ body: updateTransactionSchema }),
  transactionController.updateTransaction,
);

transactionRouter.delete('/:id', transactionController.deleteTransaction);

export default transactionRouter;
