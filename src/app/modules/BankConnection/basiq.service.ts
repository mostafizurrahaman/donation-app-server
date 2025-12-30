// src/app/modules/BankConnection/basiq.service.ts
import config from '../../config';
import Auth from '../Auth/auth.model';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import httpStatus from 'http-status';
import Client from '../Client/client.model';
import { BankConnectionModel } from './bankConnection.model';
import { roundUpTransactionService } from '../RoundUpTransaction/roundUpTransaction.service';
import axios, { AxiosError } from 'axios';
import { BANKCONNECTION_PROVIDER } from './bankConnection.constant';
import { Convert } from 'easy-currencies';
/**
 * Step 1: Generate a Session Token
 * This is used for all functional API calls.
 */
export const getBasiqActionToken = async (): Promise<string> => {
  try {
    const { data } = await axios.post(
      'https://au-api.basiq.io/token',
      { scope: 'SERVER_ACCESS' },
      {
        headers: {
          'Authorization': `Basic ${config.basiq.apiKey}`,
          'basiq-version': '3.0',
          'Content-Type': 'application/json',
        },
      }
    );
    return data.access_token;
  } catch (error: any) {
    const detail = error.response?.data?.data?.[0]?.detail || error.message;
    console.error('BASIQ_TOKEN_ERROR:', detail);
    throw new Error(`Basiq Token Generation Failed: ${detail}`);
  }
};

/**
 * Step 2: Get authentication token
 * Returns a Bearer token for API calls
 */
export const getBasiqAuthToken = async (): Promise<string> => {
  const token = await getBasiqActionToken();
  return token;
};
/**
 * Ensures your webhook is registered.
 * Basiq requires an HTTPS URL; will fail on localhost without ngrok.
 */
export const ensureBasiqWebhookRegistered = async (currentAppUrl: string) => {
  const token = await getBasiqActionToken();
  const options = {
    method: 'GET',
    url: 'https://au-api.basiq.io/notifications/webhooks',
    headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.request(options);
    const exitingWebhooks = res.data.data;
    if (exitingWebhooks?.length > 0) {
      console.log(exitingWebhooks);
      return;
    }
  } catch (error) {
    console.log(error);
  }

  const targetWebhookUrl = `${currentAppUrl}/api/v1/bank-connection/basiq-webhook`;
  console.log(targetWebhookUrl);

  const newOptions = {
    method: 'POST',
    url: 'https://au-api.basiq.io/notifications/webhooks',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: {
      subscribedEvents: [
        'transactions.updated',
        'consent.warning',
        'consent.revoked',
        'consent.expired',
        'connection.created',
        'connection.invalidated',
      ],
      name: 'My General Webhook',
      description: 'Webhook to catch all events',
      url: targetWebhookUrl,
    },
  };

  try {
    const WBResponse = await axios.request(newOptions);
    const webHook = WBResponse.data.data;
    console.log(webHook);
  } catch (error: any) {
    console.log('error', (error as AxiosError).response!.data);
  }
};

/**
 * Ensures a Basiq User exists for the given platform user.
 */
export const getOrCreateBasiqUser = async (userId: string): Promise<string> => {
  const user = await Auth.findById(userId);
  if (!user)
    throw new AppError(httpStatus.NOT_FOUND, 'User not found in system');

  const clientProfile = await Client.findOne({ auth: user._id });
  if (!clientProfile)
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User Profile not found in system'
    );

  // Check if phone number exists before creating/updating Basiq user
  if (!clientProfile.phoneNumber) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Phone number is required to connect your bank account. Please update your profile with a valid phone number before proceeding.'
    );
  }

  // If user already has a Basiq user ID, update the Basiq user with latest profile info
  if (user.basiqUserId) {
    try {
      const token = await getBasiqActionToken();

      // Update the existing Basiq user with current profile information
      await axios.post(
        `https://au-api.basiq.io/users/${user.basiqUserId}`,
        {
          email: user.email,
         
          firstName: clientProfile.name.split(' ')[0] || 'User',
          lastName: clientProfile.name.split(' ')[1] || 'Default',
          mobile: clientProfile.phoneNumber,
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
             accept: 'application/json',
            'basiq-version': '3.0',
             'content-type': 'application/json',
          },
        }
      );

      console.log(`✅ Updated Basiq user ${user.basiqUserId} with latest profile info including phone number`);
    } catch (error: any) {
      console.error('⚠️ Failed to update Basiq user info:', error.response?.data?.data?.[0]?.detail || error.message);
      // Don't throw error here, just log it - we can still proceed with the existing Basiq user
    }

    return user.basiqUserId;
  }

  // Create new Basiq user
  try {
    const token = await getBasiqActionToken();

    const { data } = await axios.post(
      'https://au-api.basiq.io/users',
      {
        email: user.email,        
        firstName: clientProfile.name.split(' ')[0] || 'User',
        lastName: clientProfile.name.split(' ')[1] || 'Default',
        mobile: clientProfile.phoneNumber,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          'basiq-version': '3.0',
          'Content-Type': 'application/json',
        },
      }
    );

    await Auth.findByIdAndUpdate(userId, { basiqUserId: data.id });
    console.log(`✅ Created new Basiq user ${data.id} with phone number`);
    return data.id;
  } catch (error: any) {
    const detail = error.response?.data?.data?.[0]?.detail || error.message;
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Basiq User Creation Failed: ${detail}`
    );
  }
};

/**
 * Generates a unique URL for the user to connect their bank.
 */
export const generateBasiqAuthLink = async (
  basiqUserId: string
): Promise<string> => {
  try {
    const token = await getBasiqActionToken();
    const { data } = await axios.post(
      `https://au-api.basiq.io/users/${basiqUserId}/auth_link`,
      {},
      {
        headers: {
          authorization: `Bearer ${token}`,
          'basiq-version': '3.0',
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(data);
    return data.links?.public!;
  } catch (error: any) {
    const detail = error.response?.data?.data?.[0]?.detail || error.message;
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to generate bank link: ${detail}`
    );
  }
};

/**
 * PULL Transactions: Triggered by Webhook
 * Fetches only NEW transactions since last sync using timestamp tracking
 */
export const fetchAndProcessBasiqTransactions = async (basiqUserId: string) => {
  try {
    const user = await Auth.findOne({ basiqUserId });
    console.log('🔍 Basiq user fetched:', user?.email);
    if (!user) {
      console.log('⚠️ No user found with basiqUserId:', basiqUserId);
      return;
    }

    // 1. Find all active Basiq connections for this user in our DB
    const activeConnections = await BankConnectionModel.find({
      user: user._id,
      provider: 'basiq',
      isActive: true,
    });

    console.log(
      `🏦 Found ${activeConnections.length} active Basiq connection(s)`
    );

    for (const conn of activeConnections) {
      try {
        // 2. Determine the start date for fetching transactions
        let fromDate: string | undefined;

        if (conn.lastSyncAt) {
          // Use lastSyncAt if available (incremental sync)
          fromDate = conn.lastSyncAt.toISOString().split('T')[0]; // Format: YYYY-MM-DD
          console.log(`📅 Incremental sync from: ${fromDate}`);
        } else {
          // First sync: fetch last 30 days to prevent backfilling all history
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          fromDate = thirtyDaysAgo.toISOString().split('T')[0];
          console.log(
            `🆕 First sync - fetching from: ${fromDate} (last 30 days)`
          );
        }

        // 3. Pull transactions ONLY for this specific account and date range
        const transactions = await getBasiqTransactions(
          basiqUserId,
          conn.accountId,
          { fromDate }
        );

        if (!transactions || transactions.length === 0) {
          console.log(`ℹ️ No new transactions for account ${conn.accountId}`);
          // Still update lastSyncAt even if no transactions
          await BankConnectionModel.findByIdAndUpdate(conn._id, {
            lastSyncAt: new Date(),
          });
          continue;
        }

        console.log(
          `✅ Fetched ${transactions.length} new transaction(s) for processing`
        );

        // 4. Map to internal format (compatible with processTransactionsFromPlaid)
        const mappedTransactions = await Promise.all(
          transactions.map(async (t: any) => ({
            transaction_id: t.id,
            amount: await Convert(Math.abs(parseFloat(t.amount)))
              .from('AUD')
              .to('USD'),
            date: t.postDate,
            name: t.description,
            iso_currency_code: 'USD',
            personal_finance_category: {
              primary: t.class?.toUpperCase(),
            },
          }))
        );

        console.log({ mappedTransactions }, { depth: Infinity });

        // 5. Process for Round-Ups using the existing Plaid processor
        console.log(
          `⚙️ Processing ${mappedTransactions.length} transaction(s) for roundup...`
        );
        const result =
          await roundUpTransactionService.processTransactionsFromPlaid(
            user._id.toString(),
            conn._id!.toString(),
            mappedTransactions
          );

        console.log(`📊 Processing complete:`, {
          processed: result.processed,
          skipped: result.skipped,
          failed: result.failed,
        });

        // 6. Update lastSyncAt after successful processing
        await BankConnectionModel.findByIdAndUpdate(conn._id, {
          lastSyncAt: new Date(),
        });
        console.log(`✅ Updated lastSyncAt for connection ${conn._id}`);
      } catch (connError: any) {
        console.error(
          `❌ Error processing connection ${conn._id}:`,
          connError.message
        );
        // Continue to next connection even if one fails
        continue;
      }
    }
  } catch (error: any) {
    console.error('❌ Basiq Pull Error:', error.message);
  }
};
/**
 * Fetch all bank accounts associated with a Basiq User
 */
export const getBasiqAccounts = async (userId: string) => {
  const user = await Auth.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found in system');
  }

  if (!user?.basiqUserId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Basiq user not initialized');
  }
  try {
    const options = {
      method: 'GET',
      url: `https://au-api.basiq.io/users/${user.basiqUserId}/accounts`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${await getBasiqActionToken()}`,
      },
    };

    const res = await axios.request(options);
    console.log(res.data);

    const filterAndFormatBasiqAccounts = (rawBasiqData: any) => {
      const allowedTypes = ['transaction', 'credit-card', 'savings'];

      return rawBasiqData
        .filter((acc: any) => allowedTypes.includes(acc.class.type))
        .map((acc: any) => ({
          provider: 'basiq', // Explicitly mention this is a Basiq account
          accountId: acc.id,
          accountName: acc.name,
          accountType: acc.class.type,
          institutionId: acc.institution,
          // We append (Basiq) to the name so it's clear in the Admin UI/Logs
          institutionName: `${acc.class.product} (Basiq)`,
          connectionId: acc.connection,
        }));
    };

    return filterAndFormatBasiqAccounts(res.data.data);
  } catch (err) {
    console.log('Error fetching Basiq accounts:', (err as any).data);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch Basiq accounts'
    );
  }

  // Array of account objects
};

/**
 * Pull transactions for a specific account, optionally filtered by date
 * @param basiqUserId - Basiq user ID
 * @param accountId - Account ID to fetch transactions for
 * @param options - Optional parameters for filtering
 * @param options.fromDate - ISO date string to fetch transactions from (inclusive)
 * @param options.limit - Maximum number of transactions to fetch (default 500)
 */
export const getBasiqTransactions = async (
  basiqUserId: string,
  accountId: string,
  options?: { fromDate?: string; limit?: number }
) => {
  const limit = options?.limit || 500;

  let filter = `account.id.eq('${accountId}')`;

  if (options?.fromDate) {
    // Basiq expects YYYY-MM-DD string format (already provided by caller)
    // Do NOT wrap in new Date() - the string is already in correct format
    filter += `,transaction.postDate.gt('${options.fromDate}')`;
  }

  const requestOptions = {
    method: 'GET',
    url: `https://au-api.basiq.io/users/${basiqUserId}/transactions?limit=${limit}&filter=${filter}`,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${await getBasiqActionToken()}`,
    },
  };
  try {
    const response = await axios.request(requestOptions);
    console.log(
      `📊 Fetched ${response.data.data?.length || 0} Basiq transactions`
    );
    console.log(response.data.data);
    return response.data.data || [];
  } catch (err) {
    console.log('Failed to fetch Basiq transactions', err);
  }
};

const saveBasiqAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { accountId, institutionName, accountName, accountType, connectionId } =
    req.body;

  const user = await Auth.findById(userId);
  if (!user?.basiqUserId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Basiq user not initialized');
  }

  // Save to your BankConnectionModel
  const connection = await BankConnectionModel.create({
    user: userId,
    provider: BANKCONNECTION_PROVIDER.BASIQ,
    itemId: user.basiqUserId,
    accountId: accountId,
    accountName: accountName,
    accountType: accountType,
    institutionName: institutionName,
    institutionId: 'basiq-link',
    consentGivenAt: new Date(),
    connectionId: connectionId,
    isActive: true,
    accessToken: 'basiq_not_required_token',
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Basiq account connected successfully',
    data: connection,
  });
});

export const basiqService = {
  generateBasiqAuthLink,
  getOrCreateBasiqUser,
  getBasiqAuthToken,
  getBasiqActionToken,
  ensureBasiqWebhookRegistered,
  fetchAndProcessBasiqTransactions,
  getBasiqAccounts,
  saveBasiqAccount,
  getBasiqTransactions,
};
