import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { forecastController } from '../controllers/forecast.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', forecastController.getMonthEndForecast);
router.get('/month-end', forecastController.getMonthEndForecast);
router.get('/month-end-forecast', forecastController.getMonthEndForecast);

export default router;