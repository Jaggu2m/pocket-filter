import type { NextFunction, Request, Response } from 'express';
import { simulationService } from '../services/simulation.service.js';
import { aiExplanationService } from '../services/ai-explanation.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class SimulationController {
  async runSimulation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await simulationService.simulate(req.user.userId, req.body, req.query.explain === 'true');

      let ai: any = null;
      if (req.query.explain === 'true') {
        ai = await aiExplanationService.explainSimulation(req.user.userId, result).catch(() => null);
      }

      sendSuccess(res, { ...result, ai }, 'Simulation completed successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const simulationController = new SimulationController();