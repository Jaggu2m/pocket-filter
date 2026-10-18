import express, { type Request, type Response } from 'express';
import cors from 'cors';
import healthRouter from './routes/health.routes.js';
import authRouter from './routes/auth.routes.js';
import accountRouter from './routes/account.routes.js';
import transactionRouter from './routes/transaction.routes.js';
import statementRouter from './routes/statement.routes.js';
import categoryRouter from './routes/category.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import budgetRouter from './routes/budget.routes.js';
import goalRouter from './routes/goal.routes.js';
import budgetPaceRouter from './routes/budget-pace.routes.js';
import recurringPaymentRouter from './routes/recurring-payment.routes.js';
import aiRouter from './routes/ai.routes.js';
import forecastRouter from './routes/forecast.routes.js';
import anomalyRouter from './routes/anomaly.routes.js';
import simulationRouter from './routes/simulation.routes.js';
import copilotRouter from './modules/copilot/copilot.routes.js';
import notificationRouter from './modules/notifications/notification.routes.js';
import insightRouter from './modules/insights/insight.routes.js';
import { insightController } from './modules/insights/insight.controller.js';
import { authenticate } from './middlewares/auth.middleware.js';
import { requestLogger } from './middlewares/logger.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

// Security and utility middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);

// Mount API routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/statement', statementRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/analytics', dashboardRouter);
app.use('/api/budgets', budgetRouter);
app.use('/api/v1/budgets', budgetRouter);
app.use('/api/goals', goalRouter);
app.use('/api/v1/goals', goalRouter);
app.use('/api/budget-pace', budgetPaceRouter);
app.use('/api/budgets/pace', budgetPaceRouter);
app.use('/api/v1/budget-pace', budgetPaceRouter);
app.use('/api/v1/budgets/pace', budgetPaceRouter);
app.use('/api/recurring-payments', recurringPaymentRouter);
app.use('/api/v1/recurring-payments', recurringPaymentRouter);
app.use('/api/ai', aiRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/forecasting', forecastRouter);
app.use('/api/v1/forecast', forecastRouter);
app.use('/api/anomalies', anomalyRouter);
app.use('/api/anomaly', anomalyRouter);
app.use('/api/v1/anomalies', anomalyRouter);
app.use('/api/simulations', simulationRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/simulate', simulationRouter);
app.use('/api/what-if', simulationRouter);
app.use('/api/scenarios', simulationRouter);
app.use('/api/v1/simulations', simulationRouter);
app.use('/api/v1/simulate', simulationRouter);
app.use('/api/copilot', copilotRouter);
app.use('/api/v1/copilot', copilotRouter);

// Phase 17: Smart Notifications & Financial Insights
app.use('/api/notifications', notificationRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/insights', insightRouter);
app.use('/api/v1/insights', insightRouter);
app.get('/api/spending/diagnostics', authenticate, (req, res, next) => insightController.getDiagnostics(req, res).catch(next));
app.get('/api/financial-review/monthly', authenticate, (req, res, next) => insightController.getMonthlyReview(req, res).catch(next));

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
