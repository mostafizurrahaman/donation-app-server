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

router.get(
  '/payment-stats',
  auth(ROLE.ADMIN),
  SubscriptionController.getAdminSubscriptionAndPaymentsStats
);
router.get(
  '/payments',
  auth(ROLE.ADMIN),

  SubscriptionController.getAdminSubscriptionAndPayments
);

router.get(
  '/overview',
  auth(ROLE.ADMIN),
  SubscriptionController.getSubscriptionOverviewController
);

router.post(
  '/cancel',
  auth(ROLE.ORGANIZATION, ROLE.BUSINESS),
  SubscriptionController.cancelSubscription
);

export const SubscriptionRoutes = router;
