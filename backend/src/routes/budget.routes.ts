import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { budgetController } from '../controllers/budget.controller.js';
import {
  createBudgetSchema,
  updateBudgetSchema,
  budgetMonthQuerySchema,
  categoryLimitBodySchema,
  uuidParamSchema,
  budgetCategoryParamsSchema,
} from '../schemas/budget.schema.js';

const budgetRouter = Router();
budgetRouter.use(authenticate);

// Specific routes first
budgetRouter.get('/current', validateRequest({ query: budgetMonthQuerySchema }), budgetController.getCurrentBudget);
budgetRouter.get('/', budgetController.listBudgets);

budgetRouter.post('/', validateRequest({ body: createBudgetSchema }), budgetController.createBudget);

budgetRouter.get(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  budgetController.getBudgetById,
);

budgetRouter.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateBudgetSchema }),
  budgetController.updateBudget,
);

budgetRouter.delete(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  budgetController.deleteBudget,
);

budgetRouter.put(
  '/:id/categories/:categoryId',
  validateRequest({ params: budgetCategoryParamsSchema, body: categoryLimitBodySchema }),
  budgetController.upsertCategoryLimit,
);

budgetRouter.delete(
  '/:id/categories/:categoryId',
  validateRequest({ params: budgetCategoryParamsSchema }),
  budgetController.deleteCategoryLimit,
);

budgetRouter.get(
  '/:id/summary',
  validateRequest({ params: uuidParamSchema }),
  budgetController.getSummary,
);

budgetRouter.get(
  '/:id/comparison',
  validateRequest({ params: uuidParamSchema }),
  budgetController.getComparison,
);

export default budgetRouter;