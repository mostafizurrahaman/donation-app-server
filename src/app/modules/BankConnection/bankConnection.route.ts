import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  createBankConnectionValidation,
  linkTokenRequestValidation,
  syncTransactionsValidation,
  updateBankConnectionValidation,
} from './bankConnection.validation';
import { bankConnectionController } from './bankConnection.controller';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';

const router = Router();

// Plaid webhook (no auth required) - MUST be defined BEFORE auth middleware
router.post('/webhook', bankConnectionController.handleWebhook);

// Generate Plaid Link token
router.post(
  '/link-token',
  auth(ROLE.CLIENT),
  // validateRequest(linkTokenRequestValidation),
  bankConnectionController.generateLinkToken
);

// Create bank connection (exchange public token)
router.post(
  '/',
  auth(ROLE.CLIENT),
  // validateRequest(createBankConnectionValidation),
  bankConnectionController.createBankConnection
);

// Get user's bank connection
router.get(
  '/me',
  auth(ROLE.CLIENT),
  bankConnectionController.getUserBankConnection
);

router.get(
  '/accounts',
  auth(ROLE.CLIENT),
  bankConnectionController.getUserBankAccounts
);

// Sync transactions
router.post(
  '/:bankConnectionId/sync',
  auth(ROLE.CLIENT),
  // validateRequest(syncTransactionsValidation),
  bankConnectionController.syncTransactions
);

// Get transactions for date range
router.get(
  '/:bankConnectionId/transactions',
  auth(ROLE.CLIENT),
  bankConnectionController.getTransactions
);

// Update bank connection
router.patch(
  '/:bankConnectionId',
  validateRequest(updateBankConnectionValidation),
  bankConnectionController.updateBankConnection
);

// Revoke consent and disconnect
router.post(
  '/:bankConnectionId/revoke',
  auth(ROLE.CLIENT),
  bankConnectionController.revokeConsent
);

export const BankConnectionRoutes = router;
