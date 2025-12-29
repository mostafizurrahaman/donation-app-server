import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { updateBankConnectionValidation } from './bankConnection.validation';
import { bankConnectionController } from './bankConnection.controller';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import {
  SandboxItemFireWebhookRequest,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
  SandboxTransactionsCreateRequest,
  SandboxTransferFireWebhookRequest,
  WebhookType,
} from 'plaid';
import config from '../../config';
import { decryptData, plaidClient } from '../../config/plaid';
import { BankConnectionModel } from './bankConnection.model';
import { AppError } from '../../utils';
import { handleBasiqWebhook } from './basiq.webhook';

const router = Router();

/**
 * @route   POST /api/v1/bank-connection/plaid-webhook
 * @desc    Public endpoint for Plaid to send transaction updates
 * @access  Public (Plaid Servers Only)
 */
router.post('/plaid-webhook', bankConnectionController.plaidWebhookHandler);

router.post('/plaid/test', auth(ROLE.CLIENT), async (req, res) => {
  const bankConnection = await BankConnectionModel.findOne({
    user: req.user?._id?.toString(),
  });

  if (!bankConnection) {
    throw new Error(`Bank connection not found!`);
  }
  const request: SandboxItemFireWebhookRequest = {
    access_token: decryptData(bankConnection.accessToken!),
    webhook_type: WebhookType.Transactions,
    webhook_code:
      SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
  };
  try {
    const response = await plaidClient.sandboxItemFireWebhook(request);

    const data = response.data;
    console.log(data);

    res.json({
      data,
    });
    // empty response upon success
  } catch (error) {
    console.log(error);
    res.json(error);
    // handle error
  }
});

router.post('/plaid/create', auth(ROLE.CLIENT), async (req, res) => {
  try {
    const bankConnection = await BankConnectionModel.findOne({
      user: req.user?._id?.toString(),
    });

    if (!bankConnection) return res.status(404).send('No connection found');

    const accessToken = decryptData(bankConnection.accessToken!);
    const today = '2025-12-24'; // Must be today or recent

    const transactionsData = [
      { desc: 'Starbucks #4521', amt: 5.75 },
      { desc: 'Walmart Supercentre', amt: 142.3 },
      { desc: 'Petro-Canada Gas', amt: 65.0 },
      { desc: 'Disney Plus Subscription', amt: 11.99 },
      { desc: 'No Frills Groceries', amt: 88.2 },
      { desc: 'Telus Mobility', amt: 75.5 },
      { desc: 'Uber Eats', amt: 34.12 },
      { desc: 'Canadian Tire', amt: 22.99 },
      { desc: 'Apple.com/Bill', amt: 12.99 },
      { desc: 'Cineplex Entertainment', amt: 45.0 },
    ];

    // Follow the documentation fields EXACTLY
    const request: SandboxTransactionsCreateRequest = {
      access_token: accessToken,
      transactions: transactionsData.map((t) => ({
        amount: t.amt,
        description: t.desc,
        date_transacted: today,
        date_posted: today,
        iso_currency_code: 'CAD',
      })),
    };

    // 1. Create the dummy transactions in Plaid
    const createResponse = await plaidClient.sandboxTransactionsCreate(request);

    // 2. Trigger the Webhook manually so your system processes them NOW
    // This calls your 'plaidWebhookHandler' in bankConnection.controller.ts
    await plaidClient.sandboxItemFireWebhook({
      access_token: accessToken,
      webhook_code:
        SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
      webhook_type: WebhookType.Transactions,
    });

    res.json({
      success: true,
      message: '10 Transactions created and Sync webhook fired!',
      request_id: createResponse.data.request_id,
    });
  } catch (error: any) {
    console.error('Plaid Error Details:', error.response?.data);
    res.status(400).json(error.response?.data || error.message);
  }
});

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

// Basiq connect:
router.post(
  '/connect-basiq',
  auth(ROLE.CLIENT),
  bankConnectionController.connectBasiqBankAccount
);

router.post('/basiq-webhook', handleBasiqWebhook);

router.get(
  '/basiq/accounts',
  auth(ROLE.CLIENT),
  bankConnectionController.getBasiqAccounts
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
