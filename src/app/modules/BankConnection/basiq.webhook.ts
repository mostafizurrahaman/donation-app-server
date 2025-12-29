// src/app/modules/BankConnection/basiq.webhook.ts
import { Request, Response } from 'express'; // <--- Add this import
import { sendResponse } from '../../utils';
import { fetchAndProcessBasiqTransactions } from './basiq.service';

export const handleBasiqWebhook = async (req: Request, res: Response) => {
  const { data } = req.body as { data: any[] };

  console.log({ data, event });

  if (!data || !Array.isArray(data)) {
    return sendResponse(res, {
      statusCode: 200,
      message: `No data found!`,
      data: data,
    });
  }

  for (const event of data) {
    const basiqUserId = event.userId;

    switch (event.entity) {
      case 'transaction':
        if (event.eventType === 'created') {
          console.log(`🚀 Basiq Webhook: New transactions for ${basiqUserId}`);
          await fetchAndProcessBasiqTransactions(basiqUserId);
        }
        break;

      case 'connection':
        if (event.eventType === 'created') {
          console.log(`🏦 Basiq Webhook: Bank connected for ${basiqUserId}`);
        }
        break;
    }
  }

  return sendResponse(res, {
    statusCode: 200,
    message: `Basiq web hook triggered successfully`,
    data: data,
  });
};
