import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { recurringPaymentController } from '../controllers/recurring-payment.controller.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const idParam = z.object({ id: z.string().uuid() });
const createSchema = z.object({
  merchantName: z.string().min(1),
  category: z.string().optional(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).optional(),
  amount: z.number().positive(),
  nextExpectedDate: z.string().optional(),
});

router.get('/', recurringPaymentController.list);
router.post('/', validateRequest({ body: createSchema }), recurringPaymentController.create);
router.post('/detect', recurringPaymentController.detect);

router.get('/:id', validateRequest({ params: idParam }), recurringPaymentController.getById);
router.patch('/:id/confirm', validateRequest({ params: idParam }), recurringPaymentController.confirm);
router.patch('/:id/dismiss', validateRequest({ params: idParam }), recurringPaymentController.dismiss);
router.delete('/:id', validateRequest({ params: idParam }), recurringPaymentController.delete);

export default router;