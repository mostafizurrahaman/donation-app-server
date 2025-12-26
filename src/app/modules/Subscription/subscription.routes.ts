import { Router } from 'express';
import { auth, validateRequest } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionValidation } from './subscription.validation';

const router = Router();

router.get(
  '/me',
  auth(ROLE.ORGANIZATION, ROLE.BUSINESS),
  SubscriptionController.getMySubscription
);
router.post(
  '/create-session',
  auth(ROLE.ORGANIZATION, ROLE.BUSINESS),
  validateRequest(SubscriptionValidation.createSessionSchema),
  SubscriptionController.createSession
);

export const SubscriptionRoutes = router;
