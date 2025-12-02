import {
  PlaidApi,
  TransactionsGetRequest,
  // ItemAccessTokenInvalidateRequest,
  ItemRemoveRequest,
  TransactionsSyncRequest,
  CountryCode,
  Products,
  DepositoryAccountSubtype,
  SandboxItemFireWebhookRequest,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
  WebhookType,
} from 'plaid';
import { BankConnectionModel } from './bankConnection.model';
import {
  IBankAccountWithRoundUpStatus,
  IBankConnection,
  IPlaidLinkTokenRequest,
  IPlaidPublicTokenExchange,
  IPlaidTransaction,
  ISyncResponse,
  IUserBankAccountsResponse,
} from './bankConnection.interface';
import plaidClient, { encryptData, decryptData } from '../../config/plaid';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import QueryBuilder from '../../builders/QueryBuilder';

// Initialize Plaid client
const plaidApi = plaidClient.client as PlaidApi;

// Generate Plaid Link token
async function generateLinkToken(
  linkTokenRequest: IPlaidLinkTokenRequest
): Promise<{ link_token: string; expiration: string }> {
  try {
    const request = {
      user: {
        client_user_id: linkTokenRequest.user.client_user_id,
        phone_number: '+14155552671',
      },
      client_name: 'Crescent Change',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL,
      account_filters: {
        depository: {
          account_subtypes: [
            DepositoryAccountSubtype.Savings,
            DepositoryAccountSubtype.Checking,
          ],
        },
      },
      ...(linkTokenRequest.account_filters && {
        account_filters: linkTokenRequest.account_filters,
      }),
    };

    console.log({ request });

    const response = await plaidApi.linkTokenCreate(request);

    return {
      link_token: response.data.link_token,
      expiration: response.data.expiration,
    };
  } catch (error: any) {
    console.error('Error generating Plaid link token:', error);

    // Extract Plaid-specific error details
    const plaidError = error?.response?.data;
    if (plaidError) {
      const errorMessage = `Plaid Error: ${
        plaidError.error_message || 'Unknown error'
      }`;
      const errorDetails = {
        code: plaidError.error_code,
        type: plaidError.error_type,
        message: plaidError.error_message,
        documentation: plaidError.documentation_url,
      };
      console.error('Plaid error details:', errorDetails);
      throw new Error(errorMessage);
    }

    throw new Error('Failed to generate Plaid link token');
  }
}

// Exchange public token for access token
async function exchangePublicTokenForAccessToken(
  exchangeData: IPlaidPublicTokenExchange,
  user: string
): Promise<IBankConnection> {
  try {
    console.log('Starting token exchange with data:', {
      public_token_length: exchangeData.public_token?.length,
      user_id: user,
      public_token_preview: exchangeData.public_token?.substring(0, 20) + '...',
    });

    const tokenResponse = await plaidApi.itemPublicTokenExchange({
      public_token: exchangeData.public_token,
    });

    console.log('Token exchange successful, got access_token and item_id');

    const accessToken = tokenResponse.data.access_token;
    const itemId = tokenResponse.data.item_id;

    // Get item information to extract institution and account details
    const itemResponse = await plaidApi.itemGet({
      access_token: accessToken,
    });

    const institutionResponse = await plaidApi.institutionsGetById({
      institution_id: itemResponse.data.item.institution_id!,
      country_codes: [CountryCode.Us],
    });

    // Get accounts to find the selected one
    const accountsResponse = await plaidApi.accountsGet({
      access_token: accessToken,
    });

    // Find the selected account (would be passed from frontend)
    const selectedAccount = accountsResponse.data.accounts[0]; // Simplified, should match selected account_id

    const bankConnection = new BankConnectionModel({
      user,
      itemId,
      accessToken: encryptData(accessToken),
      accountId: selectedAccount.account_id,
      accountName: selectedAccount.name,
      accountType: selectedAccount.subtype,
      institutionName: institutionResponse.data.institution.name,
      institutionId: itemResponse.data.item.institution_id,
      consentGivenAt: new Date(),
      isActive: true,
    });

    return await bankConnection.save();
  } catch (error: any) {
    console.error('Error exchanging public token:', error);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    console.error('Error response:', error?.response);
    console.error('Error data:', error?.response?.data);

    // Extract Plaid-specific error details
    const plaidError = error?.response?.data;
    if (plaidError) {
      const errorMessage = `Plaid Error: ${
        plaidError.error_message || 'Unknown error'
      }`;
      console.error('Plaid error details:', {
        code: plaidError.error_code,
        type: plaidError.error_type,
        message: plaidError.error_message,
      });
      throw new Error(errorMessage);
    }

    // If it's a regular error with a message, throw that
    if (error?.message) {
      throw new Error(`Exchange token error: ${error.message}`);
    }

    throw new Error('Failed to exchange public token');
  }
}

// Sync transactions using Plaid's recommended incremental sync
// UPDATED FUNCTION
async function syncTransactions(
  bankConnectionId: string,
  cursor?: string, // No longer required from frontend; used as a fallback for the first sync
  count: number = 100
): Promise<ISyncResponse> {
  try {
    const bankConnection = await BankConnectionModel.findById(bankConnectionId);

    if (!bankConnection || !bankConnection.isActive) {
      throw new Error('Bank connection not found or inactive');
    }

    const accessToken = decryptData(bankConnection.accessToken);

    // Use the cursor stored in the database from the previous sync.
    // If no cursor exists, use undefined for first-time sync (not empty string)
    const cursorToUse =
      bankConnection.lastSyncCursor ||
      (cursor && cursor.trim() !== '' ? cursor : undefined);

    const request: TransactionsSyncRequest = {
      access_token: accessToken,
      cursor: cursorToUse,
      count: count,
    };

    const response = await plaidApi.transactionsSync(request);

    // IMPORTANT: Update the last sync timestamp AND save the new cursor for the next sync.
    bankConnection.lastSyncAt = new Date();
    // Only update cursor if it's valid (not null/undefined)
    if (response.data.next_cursor) {
      bankConnection.lastSyncCursor = response.data.next_cursor;
    }
    await bankConnection.save();

    return {
      hasMore: response.data.has_more,
      nextCursor: response.data.next_cursor || undefined,
      added: response.data.added as IPlaidTransaction[],
      modified: response.data.modified as IPlaidTransaction[],
      removed: response.data.removed
        .map((item) => item.transaction_id)
        .filter((id): id is string => id !== undefined),
    };
  } catch (error: any) {
    console.error('Error syncing transactions:', error);

    // Handle specific Plaid errors
    const plaidError = error?.response?.data;
    if (plaidError) {
      const errorMessage = `Plaid Error: ${
        plaidError.error_message || 'Unknown error during transaction sync'
      }`;
      console.error('Plaid error details:', {
        code: plaidError.error_code,
        type: plaidError.error_type,
        message: plaidError.error_message,
      });

      if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED') {
        await BankConnectionModel.findByIdAndUpdate(bankConnectionId, {
          isActive: false,
        });
      }
      throw new Error(errorMessage);
    }

    throw new Error('Failed to sync transactions');
  }
}

// Get transactions for date range from Plaid API
async function getTransactions(
  bankConnectionId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const bankConnection = await BankConnectionModel.findById(bankConnectionId);

    if (!bankConnection || !bankConnection.isActive) {
      throw new Error('Bank connection not found or inactive');
    }

    const accessToken = decryptData(bankConnection.accessToken);

    const request: TransactionsGetRequest = {
      access_token: accessToken,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      options: {
        include_personal_finance_category: true,
      },
    };

    const response = await plaidApi.transactionsGet(request);
    return response.data.transactions;
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw new Error('Failed to get transactions');
  }
}

// Get stored transactions from database
async function getStoredTransactions(
  bankConnectionId: string,
  startDate?: Date,
  endDate?: Date,
  status?: string
) {
  try {
    const bankConnection = await BankConnectionModel.findById(bankConnectionId);

    if (!bankConnection) {
      throw new Error('Bank connection not found');
    }

    // Import RoundUpTransaction model
    const { RoundUpTransactionModel } = await import(
      '../RoundUpTransaction/roundUpTransaction.model'
    );

    // Build query
    const query: any = {
      bankConnection: bankConnectionId,
    };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = startDate;
      }
      if (endDate) {
        query.transactionDate.$lte = endDate;
      }
    }

    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    const transactions = await RoundUpTransactionModel.find(query)
      .sort({ transactionDate: -1 })
      .populate('organization', 'name logo')
      .populate('roundUp', 'isActive')
      .populate('donation', 'amount status');

    return transactions;
  } catch (error) {
    console.error('Error getting stored transactions:', error);
    throw new Error('Failed to get stored transactions');
  }
}

// Remove bank connection
async function removeItem(itemId: string): Promise<void> {
  try {
    // First get the bank connection to get access token
    const bankConnection = await BankConnectionModel.findOne({ itemId });

    if (bankConnection && bankConnection.accessToken) {
      const accessToken = decryptData(bankConnection.accessToken);

      const request: ItemRemoveRequest = {
        access_token: accessToken,
      };

      await plaidApi.itemRemove(request);
    }
  } catch (error) {
    console.error('Error removing Plaid item:', error);
    throw error;
  }
}

// Handle webhook events
async function handleWebhook(
  webhookType: string,
  webhookCode: string,
  itemId: string,
  data?: any
): Promise<void> {
  try {
    const bankConnection = await BankConnectionModel.findOne({ itemId });

    if (!bankConnection) {
      console.warn('Received webhook for unknown bank connection:', itemId);
      return;
    }

    switch (webhookType) {
      case 'TRANSACTIONS':
        // Trigger transaction sync
        await syncTransactions(String(bankConnection._id));
        break;

      case 'ITEM':
        if (
          webhookCode === 'ERROR' ||
          webhookCode === 'USER_PERMISSION_REVOKED'
        ) {
          // Mark connection as inactive
          bankConnection.isActive = false;
          await bankConnection.save();
        } else if (webhookCode === 'LOGIN_REQUIRED') {
          // Mark as login required - user needs to reconnect
          bankConnection.isActive = false;
          await bankConnection.save();
        }
        break;

      default:
        console.log('Unhandled webhook type:', webhookType);
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
  }
}

//  get all banks connection:
async function getUserBankAccountsWithRoundUpStatus(
  userId: string,
  queryParams: Record<string, unknown> = {}
): Promise<IUserBankAccountsResponse> {
  try {
    // Step 1: Build query for user's bank connections using QueryBuilder
    const bankConnectionQuery = BankConnectionModel.find({ user: userId });

    const queryBuilder = new QueryBuilder(bankConnectionQuery, queryParams)
      .filter()
      .sort()
      .paginate()
      .fields();

    // Execute query and get pagination meta
    const [bankConnections, paginationMeta] = await Promise.all([
      queryBuilder.modelQuery.select('-accessToken').lean().exec(),
      queryBuilder.countTotal(),
    ]);

    if (!bankConnections || bankConnections.length === 0) {
      return {
        accounts: [],
        totalAccounts: 0,
        activeRoundUps: 0,
        meta: paginationMeta,
      };
    }

    // Extract bank connection IDs for efficient lookup
    const bankConnectionIds = bankConnections.map((bc) => String(bc._id));

    // Step 2: Build query for active RoundUps using QueryBuilder
    const roundUpQuery = RoundUpModel.find({
      user: userId,
      bankConnection: { $in: bankConnectionIds },
      isActive: true,
    });

    const roundUpQueryBuilder = new QueryBuilder(roundUpQuery, {}).fields(); // Only select necessary fields

    const activeRoundUps = await roundUpQueryBuilder.modelQuery
      .populate('organization', 'name logo')
      .populate('cause', 'name description')
      .select(
        'bankConnection monthlyThreshold currentMonthTotal organization cause status enabled isTaxable'
      )
      .lean()
      .exec();

    // Step 3: Create a Map for O(1) lookup of RoundUp details by bankConnectionId
    const roundUpMap = new Map<string, any>();

    activeRoundUps.forEach((roundUp: any) => {
      const bankConnId = String(roundUp.bankConnection);
      roundUpMap.set(bankConnId, {
        roundUpId: String(roundUp._id),
        monthlyThreshold: roundUp.monthlyThreshold,
        currentMonthTotal: roundUp.currentMonthTotal,
        organization: String(roundUp.organization?._id || roundUp.organization),
        organizationName: roundUp.organization?.name || 'Unknown Organization',
        cause: roundUp.cause
          ? String(roundUp.cause?._id || roundUp.cause)
          : undefined,
        causeName: roundUp.cause?.name || undefined,
        status: roundUp.status,
        enabled: roundUp.enabled,
        isTaxable: roundUp.isTaxable || false,
      });
    });

    // Step 4: Map bank connections with RoundUp status
    const accountsWithStatus: IBankAccountWithRoundUpStatus[] =
      bankConnections.map((bankConnection: any) => {
        const bankConnectionId = String(bankConnection._id);
        const roundUpDetails = roundUpMap.get(bankConnectionId);

        return {
          ...bankConnection,
          isLinkedToActiveRoundUp: !!roundUpDetails,
          activeRoundUpId: roundUpDetails?.roundUpId,
          roundUpDetails: roundUpDetails || undefined,
        } as IBankAccountWithRoundUpStatus;
      });

    // Step 5: Calculate active RoundUps count
    const activeRoundUpCount = accountsWithStatus.filter(
      (account) => account.isLinkedToActiveRoundUp
    ).length;

    return {
      accounts: accountsWithStatus,
      totalAccounts: paginationMeta.total,
      activeRoundUps: activeRoundUpCount,
      meta: paginationMeta,
    };
  } catch (error) {
    console.error(
      'Error getting user bank accounts with RoundUp status:',
      error
    );
    throw new Error('Failed to retrieve bank accounts with RoundUp status');
  }
}

// Get bank connection details
async function getBankConnectionById(
  id: string
): Promise<IBankConnection | null> {
  return await BankConnectionModel.findById(id);
}

// Get bank connection by user
async function getBankConnectionByUserId(
  userId: string
): Promise<IBankConnection | null> {
  return await BankConnectionModel.findOne({ user: userId, isActive: true });
}

// Update bank connection
async function updateBankConnection(
  id: string,
  updateData: Partial<IBankConnection>
): Promise<IBankConnection | null> {
  return await BankConnectionModel.findByIdAndUpdate(id, updateData, {
    new: true,
  });
}

// Check if user has active bank connection
async function hasActiveBankConnection(userId: string): Promise<boolean> {
  const connection = await BankConnectionModel.findOne({
    user: userId,
    isActive: true,
  });
  return !!connection;
}

export const bankConnectionServices = {
  generateLinkToken,
  exchangePublicTokenForAccessToken,
  syncTransactions,
  getTransactions,
  getStoredTransactions,
  removeItem,
  handleWebhook,
  getBankConnectionById,
  getBankConnectionByUserId,
  updateBankConnection,
  hasActiveBankConnection,
  getUserBankAccountsWithRoundUpStatus,
};

export default bankConnectionServices;
