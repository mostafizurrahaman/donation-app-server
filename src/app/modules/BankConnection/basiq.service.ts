// src/app/modules/BankConnection/basiq.service.ts
import basiq from '@api/basiq';
import config from '../../config';
import Auth from '../Auth/auth.model';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import Client from '../Client/client.model';
import { BankConnectionModel } from './bankConnection.model';
import { roundUpTransactionService } from '../RoundUpTransaction/roundUpTransaction.service';
import axios, { AxiosError } from 'axios';
import { eventNames } from 'pdfkit';

/**
 * Step 1: Generate a Session Token
 * This is used for all functional API calls.
 */
export const getBasiqActionToken = async (): Promise<string> => {
  try {
    // Manually prefix 'Basic' as the SDK sometimes fails to auto-detect
    basiq.auth(`Basic ${config.basiq.apiKey}`);

    const { data } = await basiq.postToken(
      {
        scope: 'SERVER_ACCESS',
      },
      {
        'basiq-version': '3.0',
      }
    );

    return data.access_token;
  } catch (error: any) {
    const detail = error.data?.data?.[0]?.detail || error.message;
    console.error('BASIQ_TOKEN_ERROR:', detail);
    throw new Error(`Basiq Token Generation Failed: ${detail}`);
  }
};

/**
 * Step 2: Get an authenticated SDK instance
 * Configures the singleton 'basiq' instance with a Bearer token
 */
/**
 * Step 2: Get an authenticated SDK instance
 */
export const getBasiqClient = async () => {
  const token = await getBasiqActionToken();
  // FIX 1: You MUST manually prefix 'Bearer ' here
  // because you manually prefixed 'Basic ' in the previous step
  basiq.auth(token);
  return basiq;
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
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
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
      authorization: `Bearer ${token}`,
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

  if (user.basiqUserId) return user.basiqUserId;

  try {
    const client = await getBasiqClient();

    const { data } = await client.createUser({
      email: user.email,
      businessName: clientProfile.name,
      firstName: clientProfile.name.split(' ')[0] || 'User',
      lastName: clientProfile.name.split(' ')[1] || 'Default',
      mobile: clientProfile.phoneNumber || '',
    });

    await Auth.findByIdAndUpdate(userId, { basiqUserId: data.id });
    return data.id;
  } catch (error: any) {
    const detail = error.data?.data?.[0]?.detail || error.message;
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
    const client = await getBasiqClient();
    const { data } = await client.postAuthLink({ userId: basiqUserId });
    return data.links?.public!;
  } catch (error: any) {
    const detail = error.data?.data?.[0]?.detail || error.message;
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to generate bank link: ${detail}`
    );
  }
};

/**
 * PULL Transactions: Triggered by Webhook
 */
export const fetchAndProcessBasiqTransactions = async (basiqUserId: string) => {
  try {
    const client = await getBasiqClient();

    const user = await Auth.findOne({ basiqUserId });
    if (!user) return;

    // Fetch transactions (Basiq returns most recent by default)
    const response = await client.core.fetch(
      `/users/${basiqUserId}/transactions`,
      'get'
    );
    const transactions = response.data.data;

    const connection = await BankConnectionModel.findOne({
      user: user._id,
      provider: 'basiq',
    });
    if (!connection) return;

    // Map Basiq to Internal Round-Up format
    const mappedTransactions = transactions.map((t: any) => ({
      transaction_id: t.id,
      amount: Math.abs(parseFloat(t.amount)), // Expenditures are treated as positive numbers for rounding
      date: t.postDate,
      name: t.description,
      iso_currency_code: t.currency,
      personal_finance_category: { primary: t.class },
    }));

    return await roundUpTransactionService.processTransactionsFromPlaid(
      user._id.toString(),
      connection._id!.toString(),
      mappedTransactions
    );
  } catch (error: any) {
    console.error('fetchAndProcessBasiqTransactions Error:', error.message);
  }
};

/**
 * PULL Accounts: Sync accounts for selection UI
 */
export const syncBasiqAccounts = async (basiqUserId: string) => {
  const client = await getBasiqClient();
  const response = await client.core.fetch(
    `/users/${basiqUserId}/accounts`,
    'get'
  );
  return response.data.data;
};

export const basiqService = {
  generateBasiqAuthLink,
  getOrCreateBasiqUser,
  getBasiqClient,
  getBasiqActionToken,
  ensureBasiqWebhookRegistered,
  fetchAndProcessBasiqTransactions,
  syncBasiqAccounts,
};
