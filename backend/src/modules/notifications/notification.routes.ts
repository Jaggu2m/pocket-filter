import { Router } from 'express';
import { notificationController } from './notification.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => notificationController.list(req, res).catch(next));
router.get('/unread-count', (req, res, next) => notificationController.getUnreadCount(req, res).catch(next));
router.patch('/read-all', (req, res, next) => notificationController.markAllRead(req, res).catch(next));
router.patch('/:id/read', (req, res, next) => notificationController.markRead(req, res).catch(next));
router.delete('/:id', (req, res, next) => notificationController.delete(req, res).catch(next));

export default router;
