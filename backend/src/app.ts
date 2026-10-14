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
