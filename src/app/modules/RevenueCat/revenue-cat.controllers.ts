/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { RevenueCatService } from './revenue-cat.services';
import config from '../../config';
import { Logger } from '../../utils/logger';

/**
 * POST /webhooks/revenue-cat
 *
 * RevenueCat sends a plain Authorization header (not Bearer) whose value must
 * exactly match the secret configured in the RevenueCat dashboard.
 *
 * RevenueCat expects a 200 to acknowledge receipt.
 * Any 4xx/5xx response will trigger a retry.
 */
const handleWebhook = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const authHeader = (req.headers.authorization ?? '').trim();

    // Guard: reject immediately so we don't process forged payloads.
    // The service layer also verifies this, but a fast reject here avoids
    // unnecessary DB look-ups.
    if (!authHeader || authHeader !== config.revenueCat.webhookSecret) {
      Logger.info(
        '[RevenueCat] Webhook rejected – invalid Authorization header.',
      );
      return res.status(httpStatus.UNAUTHORIZED).json({
        error: 'Invalid Authorization header.',
      });
    }

    await RevenueCatService.handleRevenueCatWebhook(req.body, authHeader);

    return res.status(httpStatus.OK).json({ received: true });
  } catch (error: any) {
    Logger.error(`[RevenueCat] Webhook handler error: ${error.message}`, error);

    // Return 500 so RevenueCat will retry the delivery.
    return res
      .status(error.statusCode ?? httpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: error.message ?? 'Internal server error' });
  }
};

export const RevenueCatController = {
  handleWebhook,
};
