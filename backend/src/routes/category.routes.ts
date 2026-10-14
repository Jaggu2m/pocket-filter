import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { categoryController } from '../controllers/category.controller.js';
import { merchantRuleSchema } from '../schemas/category.schema.js';

const categoryRouter = Router();
categoryRouter.use(authenticate);
categoryRouter.get('/', categoryController.list);
categoryRouter.post('/rules', validateRequest({ body: merchantRuleSchema }), categoryController.saveRule);
categoryRouter.post('/recategorize', categoryController.recategorize);
export default categoryRouter;
