// src/app/modules/BankConnection/basiq.webhook.ts
import { Request, Response } from 'express'; // <--- Add this import
import { sendResponse } from '../../utils';
import {
  basiqService,
  fetchAndProcessBasiqTransactions,
} from './basiq.service';

export const handleBasiqWebhook = async (req: Request, res: Response) => {
  // Basiq wrapper: the event is inside req.body.body
  const eventData = req.body.body;

  if (!eventData) {
    return sendResponse(res, {
      data: null,
      statusCode: 200,
      message: 'No event data found',
    });
  }

  const { eventTypeId, links } = eventData;
  console.log(`🔔 Basiq Webhook Received: ${eventTypeId}`);

  // Extract IDs from the eventEntity link:
  // "https://au-api.basiq.io/users/{userId}/connections/{connectionId}"
  const entityUrl = links?.eventEntity;
  const match = entityUrl?.match(/\/users\/([^\/]+)\/connections\/([^\/]+)/);

  if (!match) {
    return res.status(200).json({ message: 'No IDs found in link' });
  }

  const [_, basiqUserId, connectionId] = match;

  try {
    switch (eventTypeId) {
      case 'connection.created':
        console.log(
          `🏦 New connection ${connectionId} for user ${basiqUserId}`
        );
        // Action: Fetch and save the accounts for this new connection
        break;

      case 'transactions.updated':
      case 'transaction.created':
        console.log(`🚀 Transactions updated for user ${basiqUserId}`);
        // Action: Pull latest transactions and process Round-Ups
        await basiqService.fetchAndProcessBasiqTransactions(basiqUserId);
        break;

      default:
        console.log(`Unhandled event type: ${eventTypeId}`);
    }
  } catch (error: any) {
    console.error('Webhook processing error:', error.message);
  }

  return sendResponse(res, {
    data: null,
    statusCode: 200,
    message: `Webhook processed`,
  });
};
