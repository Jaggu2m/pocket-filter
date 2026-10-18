import { Router } from 'express';
import { copilotController } from './copilot.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { chatRequestSchema } from './schemas/copilot.schema.js';

const copilotRouter = Router();

copilotRouter.use(authenticate);

copilotRouter.post(
  '/chat',
  validateRequest({ body: chatRequestSchema }),
  copilotController.chat,
);

copilotRouter.get('/conversations', copilotController.listConversations);
copilotRouter.get('/conversations/:id', copilotController.getConversation);
copilotRouter.delete('/conversations/:id', copilotController.deleteConversation);

export default copilotRouter;
