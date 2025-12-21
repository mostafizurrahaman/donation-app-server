import { Router } from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { notificationController } from './notification.controller';

const router = Router();

router.get(
  '/me',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
  notificationController.getNotifications
);

router.patch(
  '/mark-notification',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
  notificationController.markAsSeen
);

router.get(
  '/unseen-notification-count',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION, ROLE.ADMIN),
  notificationController.getUnseenNotificationCount
);

export const notificationRoutes = router;
