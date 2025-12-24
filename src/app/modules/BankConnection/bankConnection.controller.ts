import { Request, Response } from 'express';
import httpStatus from 'http-status';
import bankConnectionService, {
  bankConnectionServices,
} from './bankConnection.service';
import { IPlaidLinkTokenRequest } from './bankConnection.interface';
import { sendResponse } from '../../utils/ResponseHandler';
import { catchAsync } from '../../errors';
import { asyncHandler } from '../../utils';
import { basiqService } from './basiq.service';

// Generate Plaid Link token
const generateLinkToken = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  // Check if user already has active connection
  const hasActiveConnection =
    await bankConnectionService.hasActiveBankConnection(userId);

  // Create Plaid link token request with only required fields
  const plaidLinkTokenRequest: IPlaidLinkTokenRequest = {
    user: {
      client_user_id: userId,
    },
  };

  const linkTokenResponse = await bankConnectionService.generateLinkToken(
    plaidLinkTokenRequest
  );

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: hasActiveConnection
      ? 'Link token generated successfully. Note: You already have an active bank connection.'
      : 'Link token generated successfully',
    data: linkTokenResponse,
  });
});

// Exchange public token and create bank connection
const createBankConnection = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  console.log('Create bank connection request:', {
    userId,
    body: req.body,
    hasPublicToken: !!req.body.public_token,
  });

  // Check if user already has active connection
  // const hasActiveConnection =
  //   await bankConnectionService.hasActiveBankConnection(userId);
  // if (hasActiveConnection) {
  //   return sendResponse(res, StatusCodes.BAD_REQUEST, {
  //     success: false,
  //     message: 'You already have an active bank connection',
  //     data: null,
  //   });
  // }

  const bankConnection =
    await bankConnectionService.exchangePublicTokenForAccessToken(
      req.body,
      userId
    );

  sendResponse(res, httpStatus.CREATED, {
    success: true,
    message: 'Bank connection created successfully',
    data: bankConnection,
  });
});

// Sync transactions
const syncTransactions = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const bankConnectionId = req.params.bankConnectionId;

  // Validate that this bank connection belongs to the user
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return sendResponse(res, httpStatus.NOT_FOUND, {
      success: false,
      message: 'Bank connection not found',
      data: null,
    });
  }

  const syncResponse = await bankConnectionService.syncTransactions(
    bankConnectionId,
    req.body.cursor,
    req.body.count
  );

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Transactions synced successfully',
    data: syncResponse,
  });
});

// Get transactions for date range
const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const bankConnectionId = req.params.bankConnectionId;
  const { startDate, endDate } = req.query;

  // Validate that this bank connection belongs to the user
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );

  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return sendResponse(res, httpStatus.NOT_FOUND, {
      success: false,
      message: 'Bank connection not found',
      data: null,
    });
  }

  if (!startDate || !endDate) {
    return sendResponse(res, httpStatus.BAD_REQUEST, {
      success: false,
      message: 'Start date and end date are required',
      data: null,
    });
  }

  const transactions = await bankConnectionService.getTransactions(
    bankConnectionId,
    new Date(startDate as string),
    new Date(endDate as string)
  );

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Transactions retrieved successfully',
    data: transactions,
  });
});

// Get user's bank connection
const getUserBankConnection = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;

    const bankConnection =
      await bankConnectionService.getBankConnectionByUserId(userId);

    if (!bankConnection) {
      return sendResponse(res, httpStatus.NOT_FOUND, {
        success: false,
        message: 'No active bank connection found',
        data: null,
      });
    }

    sendResponse(res, httpStatus.OK, {
      success: true,
      message: 'Bank connection retrieved successfully',
      data: bankConnection,
    });
  }
);

const getUserBankAccounts = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const queryParams = req.query;

  const result =
    await bankConnectionService.getUserBankAccountsWithRoundUpStatus(
      userId,
      queryParams
    );

  if (!result.accounts || result.accounts.length === 0) {
    return sendResponse(res, httpStatus.OK, {
      success: true,
      message: 'No bank accounts found',
      data: [],
      meta: result.meta,
    });
  }

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Bank accounts retrieved successfully',
    data: result.accounts,
    meta: result.meta,
  });
});

// Update bank connection
const updateBankConnection = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const bankConnectionId = req.params.bankConnectionId;

  // Validate that this bank connection belongs to the user
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || bankConnection.user !== userId) {
    return sendResponse(res, httpStatus.NOT_FOUND, {
      success: false,
      message: 'Bank connection not found',
      data: null,
    });
  }

  const updatedConnection = await bankConnectionService.updateBankConnection(
    bankConnectionId,
    req.body
  );

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Bank connection updated successfully',
    data: updatedConnection,
  });
});

// Revoke consent and disconnect
const revokeConsent = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const bankConnectionId = req.params.bankConnectionId;

  // Validate that this bank connection belongs to the user
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || bankConnection.user !== userId) {
    return sendResponse(res, httpStatus.NOT_FOUND, {
      success: false,
      message: 'Bank connection not found',
      data: null,
    });
  }

  // Update the bank connection to mark as inactive
  await bankConnectionService.updateBankConnection(bankConnectionId, {
    isActive: false,
  });

  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Bank connection revoked and disconnected successfully',
    data: null,
  });
});

// Plaid webhook handler
// const handleWebhook = catchAsync(async (req: Request, res: Response) => {
//   const { webhook_type, webhook_code, item_id, error } = req.body;

//   await bankConnectionService.handleWebhook(
//     webhook_type,
//     webhook_code,
//     item_id,
//     error
//   );

//   sendResponse(res, httpStatus.OK, {
//     success: true,
//     message: 'Webhook processed successfully',
//     data: null,
//   });
// });

// Get stored transactions from database
const getStoredTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const bankConnectionId = req.params.bankConnectionId;
    const { startDate, endDate, status } = req.query;

    // Validate that this bank connection belongs to the user
    const bankConnection = await bankConnectionService.getBankConnectionById(
      bankConnectionId
    );
    if (!bankConnection || bankConnection.user !== userId) {
      return sendResponse(res, httpStatus.NOT_FOUND, {
        success: false,
        message: 'Bank connection not found',
        data: null,
      });
    }

    const transactions = await bankConnectionService.getStoredTransactions(
      bankConnectionId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
      status as string
    );

    sendResponse(res, httpStatus.OK, {
      success: true,
      message: 'Stored transactions retrieved successfully',
      data: {
        count: transactions.length,
        transactions,
      },
    });
  }
);

const plaidWebhookHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { webhook_type, webhook_code, item_id } = req.body;

    console.log(
      `\n🔔 Plaid Webhook Received: ${webhook_type} - ${webhook_code}`
    );

    // Handle Transaction Updates
    if (webhook_type === 'TRANSACTIONS') {
      switch (webhook_code) {
        case 'SYNC_UPDATES_AVAILABLE':
        case 'INITIAL_UPDATE':
        case 'HISTORICAL_UPDATE':
          bankConnectionServices
            .handleTransactionsWebhook(item_id)
            .then((stats) => console.log(`✅ Webhook Sync Complete:`, stats))
            .catch((err) => console.error(`❌ Webhook Sync Failed:`, err));
          break;

        case 'TRANSACTIONS_REMOVED':
          break;
      }
    }

    // Always respond 200 to Plaid immediately to prevent retries
    return res.status(httpStatus.OK).json({ received: true });
  }
);

const connectBasiqBankAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();

  // 1. Ensure user exists in Basiq
  const basiqUserId = await basiqService.getOrCreateBasiqUser(userId);

  // 2. Generate the login URL
  const authLink = await basiqService.generateBasiqAuthLink(basiqUserId);

  // 3. Return to frontend
  sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Basiq Auth Link generated successfully',
    data: {
      url: authLink, // Frontend will do: window.location.href = data.url
    },
  });
});

export const bankConnectionController = {
  generateLinkToken,
  createBankConnection,
  syncTransactions,
  getTransactions,
  getStoredTransactions,
  getUserBankConnection,
  getUserBankAccounts,
  updateBankConnection,
  revokeConsent,
  plaidWebhookHandler,
  connectBasiqBankAccount,
};
