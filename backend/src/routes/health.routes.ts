import { Router } from 'express';
import { getLiveness, getReadinessStatus } from '../controllers/health.controllers.js';

const healthRouter = Router();

healthRouter.get('/', getLiveness);
healthRouter.get('/ready', getReadinessStatus);

export default healthRouter;
