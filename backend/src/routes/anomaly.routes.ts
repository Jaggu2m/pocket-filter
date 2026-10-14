import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { anomalyController } from '../controllers/anomaly.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', anomalyController.getAnomalies);
router.get('/detect', anomalyController.getAnomalies);

export default router;