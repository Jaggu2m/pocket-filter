import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { simulationController } from '../controllers/simulation.controller.js';

const router = Router();
router.use(authenticate);

router.post('/', simulationController.runSimulation);
router.post('/run', simulationController.runSimulation);
router.post('/what-if', simulationController.runSimulation);
router.post('/simulate', simulationController.runSimulation);
router.post('/scenario', simulationController.runSimulation);

export default router;