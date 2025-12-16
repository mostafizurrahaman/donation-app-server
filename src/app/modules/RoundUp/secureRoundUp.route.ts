import { Router } from 'express';

import { validateRequest } from '../../middlewares/validateRequest';
import {
  savePlaidConsentValidation,
  processMonthlyDonationValidation,
  switchCharityValidation,
  syncTransactionsValidation,
  bankConnectionIdParamValidation,
  resumeRoundUpValidation,
  testRoundUpProcessingCronValidation,
} from './roundUp.validation';
import { roundUpController } from './secureRoundUp.controller';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';

const router = Router();

// Save Plaid consent and create round-up configuration
router.post(
  '/consent/save',
  auth(ROLE.CLIENT),
  validateRequest(savePlaidConsentValidation),
  roundUpController.savePlaidConsent
);

// Revoke consent and disconnect
router.post(
  '/consent/revoke/:bankConnectionId',
  auth(ROLE.CLIENT),
  validateRequest(bankConnectionIdParamValidation),
  roundUpController.revokeConsent
);

// Sync transactions (NOTE: RoundUp processing is now automatic via cron job)
router.post(
  '/transactions/sync/:bankConnectionId',
  auth(ROLE.CLIENT),
  validateRequest(bankConnectionIdParamValidation),
  validateRequest(syncTransactionsValidation),
  roundUpController.syncTransactions
);

// Resume/unpause round-up
router.post(
  '/resume',
  auth(ROLE.CLIENT),
  validateRequest(resumeRoundUpValidation),
  roundUpController.resumeRoundUp
);

// Switch charity with 30-day validation
router.post(
  '/charity/switch',
  auth(ROLE.CLIENT),
  validateRequest(switchCharityValidation),
  roundUpController.switchCharity
);

// Get user dashboard
router.get('/dashboard', auth(ROLE.CLIENT), roundUpController.getUserDashboard);

// ADMIN ENDPOINTS (ADMIN role required)

// Manual test endpoint for RoundUp processing cron
router.post(
  '/test-cron-processing',
  auth(ROLE.ADMIN),
  validateRequest(testRoundUpProcessingCronValidation),
  roundUpController.testRoundUpProcessingCron
);

export const SecureRoundUpRoutes = router;
