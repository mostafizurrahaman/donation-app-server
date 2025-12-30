// src/app/modules/BankConnection/basiq.webhook.ts
import { Request, Response } from 'express'; // <--- Add this import
import { sendResponse } from '../../utils';
import {
  basiqService,
  fetchAndProcessBasiqTransactions,
} from './basiq.service';


const extractUserId = (url?: string) => {
  return url?.match(/\/users\/([^\/]+)/)?.[1];
};

const extractConnectionId = (url?: string) => {
  return url?.match(/\/connections\/([^\/]+)/)?.[1];
};

const extractConsentId = (url?: string) => {
  return url?.match(/\/consents\/([^\/]+)/)?.[1];
};


export const handleBasiqWebhook = async (req: Request, res: Response) => {
  const eventData = req.body;

  if (!eventData) {
    return sendResponse(res, {
      statusCode: 200,
      message: 'No event data found',
      data: null,
    });
  }

  const { eventTypeId, links } = eventData;
  const entityUrl = links?.eventEntity;

  const basiqUserId = extractUserId(entityUrl);
  const connectionId = extractConnectionId(entityUrl);

  console.log('🔔 Basiq Webhook Received:', {
    eventTypeId,
    basiqUserId,
    connectionId,
    entityUrl,
  });

  try {
    switch (eventTypeId) {
      case 'connection.created':
        if (!connectionId) break;

        console.log(`🏦 New connection ${connectionId} for user ${basiqUserId}`);
        // fetch accounts if needed
        break;

      case 'transactions.updated':
      case 'transaction.created':
        if (!basiqUserId) break;

        console.log(`🚀 Transactions updated for user ${basiqUserId}`);
        await basiqService.fetchAndProcessBasiqTransactions(basiqUserId);
        break;

      case 'consent.revoked':
        console.log(`⚠️ Consent revoked for user ${basiqUserId}`);
        // mark consent revoked in DB
        break;

      default:
        console.log(`Unhandled event type: ${eventTypeId}`);
    }
  } catch (error: any) {
    console.error('Webhook processing error:', error.message);
  }

  return sendResponse(res, {
    statusCode: 200,
    message: 'Webhook processed',
    data: null,
  });
};
