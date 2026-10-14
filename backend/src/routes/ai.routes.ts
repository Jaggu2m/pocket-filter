import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { aiController } from '../controllers/ai.controller.js';

const router = Router();
router.use(authenticate);

router.get('/explain/budget-pace', aiController.explainBudgetPace);
router.get('/budget-pace', aiController.explainBudgetPace);
router.get('/budget-pace/explanation', aiController.explainBudgetPace);
router.get('/explain/forecast', aiController.explainForecast);
router.get('/forecast', aiController.explainForecast);
router.get('/explain/anomalies', aiController.explainAnomalies);
router.get('/anomalies', aiController.explainAnomalies);

export default router;