import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { RevenueCatService } from './revenue-cat.services';
import crypto from 'crypto';
import config from '../../config';

const handleWebhook = async (req: Request, res: Response) => {
  try {
    // Revenue cat header:
    const authHeader = req.headers.authorization || '';
    //
    console.log(req.body);

    if (authHeader !== config.revenueCat.webhookSecret) {
      res.status(httpStatus.UNAUTHORIZED).json({
        error: 'Invalid Authorization header!',
      });
      console.log(`[Authorization]: Invalid Header`);
    }

    // RevenueCat webhook handler
    await RevenueCatService.handleRevenueCatWebhook(req.body, authHeader);

    // RevenueCat expects a 200 response to acknowledge receipt
    res.status(httpStatus.OK).json({ received: true });
  } catch (error: any) {
    console.error(`❌ RevenueCat Webhook Error: ${error.message}`);
    // Using 400 or 401 will tell RevenueCat to retry the webhook
    res
      .status(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR)
      .send(error.message);
  }
};

export const RevenueCatController = {
  handleWebhook,
};
