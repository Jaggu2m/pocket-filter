import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { recurringPaymentController } from '../controllers/recurring-payment.controller.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const idParam = z.object({ id: z.string().uuid() });

router.get('/', recurringPaymentController.list);
router.post('/detect', recurringPaymentController.detect);

router.get('/:id', validateRequest({ params: idParam }), recurringPaymentController.getById);
router.patch('/:id/confirm', validateRequest({ params: idParam }), recurringPaymentController.confirm);
router.patch('/:id/dismiss', validateRequest({ params: idParam }), recurringPaymentController.dismiss);

export default router;