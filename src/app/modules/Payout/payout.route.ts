import { Router } from 'express';
import { auth, validateRequest } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { PayoutController } from './payout.controller';
import { PayoutValidation } from './payout.validation';

const router = Router();

// Request Payout
router.post(
  '/request',
  auth(ROLE.ORGANIZATION),
  validateRequest(PayoutValidation.createPayoutSchema),
  PayoutController.requestPayout
);

// Cancel Payout
router.patch(
  '/:id/cancel',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  PayoutController.cancelPayout
);

// Get History
router.get(
  '/',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  PayoutController.getPayouts
);

// get next organization next payoutDate
router.get(
  '/next-payout',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  PayoutController.getOrganizationNextPayoutDate
);

export const PayoutRoutes = router;
