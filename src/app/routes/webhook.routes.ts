/* eslint-disable @typescript-eslint/no-namespace */
import { Router } from 'express';
import { asyncHandler } from '../utils';
import { WebhookHandler } from '../modules/Donation/webhook.handler';

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

const router = Router();

// Stripe webhook endpoint - uses raw body from custom middleware
router.post(
  '/donation/stripe1',
  asyncHandler(async (req, res) => {
    // Use raw body from our custom middleware
    const rawBody = req.rawBody;

    return await WebhookHandler.handleStripeWebhook(req, res, rawBody);
  })
);

export default router;
