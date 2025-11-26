import { Router } from 'express';
import { auth } from '../../middlewares';
import { validateRequest } from '../../middlewares/validateRequest';
import { DonationController } from './donation.controller';
import { DonationValidation } from './donation.validation';
import { ROLE } from '../Auth/auth.constant';

const router = Router();

// 1. Create one-time donation with PaymentIntent
router.post(
  '/one-time/create',
  auth(ROLE.CLIENT),
  validateRequest(DonationValidation.createOneTimeDonationSchema),
  DonationController.createOneTimeDonation
);

// 2. Retry failed payment
router.post(
  '/:donationId/retry',
  auth(ROLE.CLIENT),
  validateRequest(DonationValidation.retryFailedPaymentSchema),
  DonationController.retryFailedPayment
);

// 3. Get donation full status with payment info
router.get(
  '/:id/status',
  auth(ROLE.CLIENT, ROLE.ADMIN, ROLE.ORGANIZATION),
  validateRequest(DonationValidation.getDonationByIdSchema),
  DonationController.getDonationFullStatus
);

// 4. Get user donations with pagination and filters (QueryBuilder)
router.get(
  '/user',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(DonationValidation.getUserDonationsSchema),
  DonationController.getUserDonations
);

// 5. Get specific donation by ID (only if user owns it)
router.get(
  '/:id',
  auth(ROLE.ADMIN, ROLE.CLIENT, ROLE.ORGANIZATION),
  validateRequest(DonationValidation.getDonationByIdSchema),
  DonationController.getDonationById
);

// 6. Get donations by organization ID (QueryBuilder)
router.get(
  '/organization/:organizationId',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  validateRequest(DonationValidation.getOrganizationDonationsSchema),
  DonationController.getOrganizationDonations
);

router.get(
  '/organization/:organizationId/cause-stats',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  validateRequest(DonationValidation.getOrganizationCauseStatsSchema),
  DonationController.getOrganizationCauseStats
);

// 7. Cancel donation
router.post(
  '/:id/cancel',
  auth(ROLE.CLIENT),
  validateRequest(DonationValidation.cancelDonationSchema),
  DonationController.cancelDonation
);

// 8. Refund donation
router.post(
  '/:id/refund',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(DonationValidation.refundDonationSchema),
  DonationController.refundDonation
);

// 9. Get donation stats for user
router.get(
  '/analytics/stats',
  auth(ROLE.ADMIN, ROLE.ORGANIZATION), // Only admin can access
  validateRequest(DonationValidation.getDonationAnalyticsSchema),
  DonationController.getDonationAnalyticsController
);

// 10. Get yearly donation trends for organization
router.get(
  '/analytics/yearly-trends',
  auth(ROLE.ORGANIZATION),
  validateRequest(DonationValidation.getOrganizationDonationYearlyTrends),
  DonationController.getOrganizationYearlyDonationTrends
);

export default router;
