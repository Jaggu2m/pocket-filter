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
import { requestLogger } from './middlewares/logger.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

// Security and utility middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.use('/api/insights', dashboardRouter);
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
