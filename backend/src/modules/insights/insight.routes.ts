import { Router } from 'express';
import { insightController } from './insight.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/diagnostics', (req, res, next) => insightController.getDiagnostics(req, res).catch(next));
router.get('/monthly-review', (req, res, next) => insightController.getMonthlyReview(req, res).catch(next));
router.post('/evaluate', (req, res, next) => insightController.evaluate(req, res).catch(next));
router.get('/', (req, res, next) => insightController.list(req, res).catch(next));
router.get('/:id', (req, res, next) => insightController.getById(req, res).catch(next));

export default router;
