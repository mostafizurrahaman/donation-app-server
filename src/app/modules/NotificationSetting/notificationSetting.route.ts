import express from 'express';
import auth from '../../middlewares/auth';
import { ROLE as USER_ROLE } from '../Auth/auth.constant';
import { NotificationSettingController } from './notificationSetting.controller';
import { validateRequest } from '../../middlewares/validateRequest';
import { NotificationSettingValidations } from './notificationSetting.validation';

const router = express.Router();

router.get(
  '/',
  auth(USER_ROLE.CLIENT, USER_ROLE.BUSINESS, USER_ROLE.ADMIN),
  NotificationSettingController.getNotificationSettings
);

router.patch(
  '/',
  auth(USER_ROLE.CLIENT, USER_ROLE.BUSINESS, USER_ROLE.ADMIN),
  validateRequest(
    NotificationSettingValidations.updateNotificationSettingValidation
  ),
  NotificationSettingController.updateNotificationSettings
);

export const NotificationSettingRoutes = router;
