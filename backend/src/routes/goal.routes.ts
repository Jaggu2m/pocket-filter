import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { goalController } from '../controllers/goal.controller.js';
import {
  createGoalSchema,
  updateGoalSchema,
  contributionSchema,
  reversalSchema,
  uuidParamSchema,
  contributionParamsSchema,
} from '../schemas/goal.schema.js';

const goalRouter = Router();
goalRouter.use(authenticate);

goalRouter.get('/', goalController.listGoals);
goalRouter.post('/', validateRequest({ body: createGoalSchema }), goalController.createGoal);

goalRouter.get('/:id', validateRequest({ params: uuidParamSchema }), goalController.getGoal);
goalRouter.patch('/:id', validateRequest({ params: uuidParamSchema, body: updateGoalSchema }), goalController.updateGoal);
goalRouter.delete('/:id', validateRequest({ params: uuidParamSchema }), goalController.deleteGoal);

goalRouter.post('/:id/contributions', validateRequest({ params: uuidParamSchema, body: contributionSchema }), goalController.addContribution);

goalRouter.get('/:id/contributions', validateRequest({ params: uuidParamSchema }), goalController.listContributions);

goalRouter.post(
  '/:id/contributions/:contributionId/reversal',
  validateRequest({ params: contributionParamsSchema, body: reversalSchema }),
  goalController.reverseContribution,
);

// Convenience aliases
goalRouter.delete(
  '/:id/contributions/:contributionId',
  validateRequest({ params: contributionParamsSchema }),
  goalController.reverseContribution,
);

goalRouter.get(
  '/:id/saving-plan',
  validateRequest({ params: uuidParamSchema }),
  goalController.getSavingPlan,
);

export default goalRouter;