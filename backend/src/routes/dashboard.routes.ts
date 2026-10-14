import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { dashboardController } from '../controllers/dashboard.controller.js';

const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// Primary dashboard endpoint
dashboardRouter.get('/', dashboardController.getDashboard);

// Common alias names used by clients/tests
dashboardRouter.get('/summary', dashboardController.getDashboard);
dashboardRouter.get('/analytics', dashboardController.getDashboard);
dashboardRouter.get('/overview', dashboardController.getDashboard);
dashboardRouter.get('/cashflow', dashboardController.getDashboard);

export default dashboardRouter;