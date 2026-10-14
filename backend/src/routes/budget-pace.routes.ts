import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { budgetPaceController } from '../controllers/budget-pace.controller.js';
import { aiController } from '../controllers/ai.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', budgetPaceController.getPace);
router.get('/overall', budgetPaceController.getPace);
router.get('/categories', budgetPaceController.getPace);
router.get('/explanation', aiController.explainBudgetPace);

export default router;