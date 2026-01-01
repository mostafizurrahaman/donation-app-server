// src/app/modules/BankConnection/basiq.webhook.ts
import { Request, Response } from 'express'; // <--- Add this import
import { sendResponse } from '../../utils';
import {
  basiqService,
  fetchAndProcessBasiqTransactions,
} from './basiq.service';
import { BankConnectionModel } from './bankConnection.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';
import Auth from '../Auth/auth.model';

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
  const { eventTypeId, links } = req.body;
  const entityUrl = links?.eventEntity;
  const basiqUserId = extractUserId(entityUrl);
  const connectionId = extractConnectionId(entityUrl);

  try {
    switch (eventTypeId) {
      case 'transactions.updated':
        await basiqService.fetchAndProcessBasiqTransactions(basiqUserId!);
        break;

      case 'connection.invalidated':
      case 'consent.revoked':
      case 'consent.expired':
        console.log(`connection.invalidated INSIDE`, {
          basiqUserId,
          connectionId,
        });
        // 1. Deactivate Connection
        await BankConnectionModel.updateMany(
          { itemId: basiqUserId, connectionId: connectionId },
          { isActive: false }
        );
        // 2. Pause RoundUp
        const conn = await BankConnectionModel.findOne({ connectionId });
        await RoundUpModel.findOneAndUpdate(
          { bankConnection: conn?._id },
          {
            enabled: false,
            status: 'failed',
            lastDonationFailureReason: 'Bank connection lost',
          }
        );
        // 3. Notify User
        if (conn) {
          await createNotification(
            conn.user.toString(),
            NOTIFICATION_TYPE.BANK_DISCONNECTED,
            'Your bank connection has expired. Please reconnect to continue your Round-Ups.'
          );
        }
        break;

      case 'user.deleted':
        await BankConnectionModel.deleteMany({
          itemId: basiqUserId,
        });

        await Auth.findOneAndUpdate(
          { basiqUserId },
          { $unset: { basiqUserId: 1 } }
        );
        break;
      case 'account.updated': {
        // 1. Get account details from the webhook data
        // Basiq usually sends the account object in the data field
        const accountData = req.body.data;
        const accountId = accountData.id;
        const status = accountData.status; // e.g., 'deleted' or 'inactive'
        console.log({
          accountData,
          accountId,
          status,
        });

        if (status === 'deleted' || status === 'inactive') {
          // 2. Mark the Bank Connection as inactive in our DB
          const connection = await BankConnectionModel.findOneAndUpdate(
            { accountId: accountId },
            { isActive: false }
          );

          if (connection) {
            // 3. Stop the RoundUp but KEEP the balance
            await RoundUpModel.findOneAndUpdate(
              { bankConnection: connection._id },
              {
                enabled: false,
                status: 'failed',
                lastDonationFailureReason:
                  'Bank account sharing stopped by user',
              }
            );

            // 4. Notify the user
            await createNotification(
              connection.user.toString(),
              NOTIFICATION_TYPE.BANK_DISCONNECTED,
              `We've lost access to your account: ${connection.accountName}. Your Round-Ups are paused, but pending balances will still be donated at month-end.`
            );
          }
        } else {
          // If it was just a name change (e.g., 'My Savings' to 'Holiday Fund')
          await BankConnectionModel.findOneAndUpdate(
            { accountId: accountId },
            { accountName: accountData.name }
          );
        }
        break;
      }
    }
  } catch (error) {
    console.error('Basiq Webhook Error:', error.message);
  }

  return res.status(200).send();
};
