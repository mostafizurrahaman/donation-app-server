// src/app/modules/BankConnection/basiq.webhook.ts
import { Request, Response } from 'express'; // <--- Add this import
import { sendResponse } from '../../utils';
import { basiqService } from './basiq.service';
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

  console.log({
    ...req.body,
  });

  try {

    switch (eventTypeId) {
      case 'transactions.updated':
        await basiqService.fetchAndProcessBasiqTransactions(basiqUserId!);
        break;

      case 'connection.created':
      case 'account.created':
        console.log(`✨ Basiq Connection/Account Created: ${basiqUserId}`);
        if (basiqUserId) {
          await basiqService.syncUserBasiqConnections(basiqUserId);
        }
        break;

      case 'connection.invalidated':
      case 'consent.revoked':
      case 'consent.expired':
        console.log(`connection.invalidated INSIDE`, {
          basiqUserId,
          connectionId,
        });
        // 1. Deactivate Connection
        // NOTE: We now query by bsiqUserId or connectionId, as itemId is mapped to accountId.
        await BankConnectionModel.updateMany(
          {
            $or: [{ connectionId: connectionId }, { bsiqUserId: basiqUserId }],
          },
          { isActive: false }
        );
        // 2. Pause RoundUp
        const bankConnections = await BankConnectionModel.find({
          bsiqUserId: basiqUserId,
        });
        const ids = bankConnections?.map((conn) => conn._id);
        console.log(`Bank Connection ids`, ids);

        if (ids?.length > 0) {
          await RoundUpModel.updateMany(
            {
              bankConnection: {
                $in: ids,
              },
            },
            {
              enabled: false,
              status: 'failed',
              lastDonationFailureReason: 'Bank connection lost',
            }
          );
        }
        // 3. Notify User
        if (ids.length > 0) {
          await createNotification(
            bankConnections[0].user.toString(),
            NOTIFICATION_TYPE.BANK_DISCONNECTED,
            'Your bank connection has expired. Please reconnect to continue your Round-Ups.',
            bankConnections[0]._id?.toString(),
            {
              disconnectedBanks: bankConnections
            }
          );
        }
        break;

      case 'connection.deleted':
        console.log(`✨ Basiq Connection Deleted: ${connectionId}`);
        if (connectionId) {
          const conn = await BankConnectionModel.find({ connectionId });

          const ids = conn?.map((conn) => conn._id);
          if (ids?.length > 0) {
            // Disable RoundUps
            await RoundUpModel.updateMany(
              { bankConnection: { $in: ids } },
              {
                enabled: false,
                status: 'failed',
                lastDonationFailureReason: 'Bank connection deleted',
              }
            );


            if (ids.length > 0) {
              // Notify
              await createNotification(
                conn[0].user.toString(),
                NOTIFICATION_TYPE.BANK_DISCONNECTED,
                `Your bank ${conn[0].institutionName?.split(' ')[0]} connection was removed. Please reconnect to continue Round-Ups.`,
                conn[0]._id?.toString(),
                {
                  disconnectedBanks: [conn],
                }
              );
            }

            // Delete
            await BankConnectionModel.deleteMany({ _id: { $in: ids } });
          }
        }
        break;

      case 'user.deleted':
        const bankConns = await BankConnectionModel.find({
          bsiqUserId: basiqUserId, // CHANGED from itemId
        });

        const bankIds = bankConns?.map((conn) => conn._id) || [];
        console.log(bankIds?.length + "Bank Connections deleted");

        if (bankIds?.length > 0) {
          // Disable RoundUps
          await RoundUpModel.updateMany(
            { bankConnection: { $in: bankIds } },
            {
              enabled: false,
              status: 'failed',
              lastDonationFailureReason: 'Bank connection deleted',
            }
          );

          // Notify
          await createNotification(
            bankConns[0].user.toString(),
            NOTIFICATION_TYPE.BANK_DISCONNECTED,
            `Your bank ${bankConns[0].institutionName?.split(' ')[0]} connection was removed. Please reconnect to continue Round-Ups.`,
            bankConns[0]._id?.toString(),
            {
              disconnectedBanks: [bankConns],
            }
          );
        }

        await Auth.findOneAndUpdate(
          { basiqUserId },
          { $unset: { basiqUserId: 1 } }
        );






        if (bankConns?.length > 0) {
          // Disable RoundUps
          await RoundUpModel.updateMany(
            { bankConnection: { $in: bankConns } },
            {
              enabled: false,
              status: 'failed',
              lastDonationFailureReason: 'Bank connection deleted',
            }
          );
        }
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
  } catch (error: any) {
    console.error('Basiq Webhook Error:', error.message);
  }

  return res.status(200).send();
};
