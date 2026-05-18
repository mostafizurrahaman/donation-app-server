/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status';
import { AppError } from '../../utils';
import { Subscription } from '../Subscription/subscription.model';
import { SubscriptionHistory } from '../subscriptionHistory/subscriptionHistory.model';
import Auth from '../Auth/auth.model';
import { ROLE } from '../Auth/auth.constant';
import {
  SUBSCRIPTION_STATUS,
  PLAN_TYPE,
  REVENUE_CAT_EVENT_STATUS_MAP,
  TPlanType,
} from '../Subscription/subscription.constant';
import config from '../../config';
import { Logger } from '../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a currency string to lowercase (e.g. "USD" → "usd").
 * RevenueCat sends uppercase; Stripe sends lowercase.  We always store lowercase
 * to keep the two sources consistent.
 */
// const normalizeCurrency = (currency?: string): string =>
//   (currency || 'usd').toLowerCase();

/**
 * Derives the plan type from a RevenueCat product ID.
 * Adjust the keywords to match your actual product ID naming convention.
 */
const resolvePlanType = (productId: string): TPlanType =>
  productId.toLowerCase().includes('year') ||
  productId.toLowerCase().includes('annual')
    ? PLAN_TYPE.YEARLY
    : PLAN_TYPE.MONTHLY;

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS THAT RESULT IN AN "ACTIVE" STATUS (payment actually occurred)
// ─────────────────────────────────────────────────────────────────────────────
const PAYMENT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
]);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

const handleRevenueCatWebhook = async (
  payload: any,
  authHeader: string,
): Promise<void> => {
  // 1. Verify webhook authenticity (double-checked here as well as in controller)
  if (authHeader !== config.revenueCat.webhookSecret) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid Webhook Authorization Header',
    );
  }

  const event = payload?.event;
  if (!event) {
    Logger.info(
      '[RevenueCat] Received payload without an event object – skipping.',
    );
    return;
  }

  Logger.info(`[RevenueCat] Processing event type: ${event.type}`);
  Logger.info(event);

  const appUserId: string | undefined = event.app_user_id;

  // 2. Resolve the Auth user
  if (!appUserId) {
    Logger.info('[RevenueCat] Missing app_user_id in event – skipping.');
    return;
  }

  let user;
  try {
    user = await Auth.findById(appUserId);
  } catch {
    Logger.info(`[RevenueCat] Invalid app_user_id format: ${appUserId}`);
    return;
  }

  if (!user) {
    Logger.info(`[RevenueCat] User not found: ${appUserId}`);
    return;
  }

  // 3. Enforce BUSINESS role
  if (user.role !== ROLE.BUSINESS) {
    Logger.info(
      `[RevenueCat] Event ignored – user ${appUserId} has role "${user.role}", expected BUSINESS.`,
    );
    return;
  }

  // 4. Extract common event fields
  const transactionId: string = event.transaction_id;
  const purchasedAt = new Date(event.purchased_at_ms);
  const expirationAt = new Date(event.expiration_at_ms);
  const price: number = event.price ?? 0;
  const currency: string = 'usd'; // Always lowercase
  const entitlementId: string = event.entitlement_ids?.[0] ?? 'pro';
  const productId: string = event.product_id ?? '';
  const planType: TPlanType = resolvePlanType(productId);

  // 5. Resolve the target internal status from the event type
  //    Falls back to undefined for unknown/unhandled event types.
  const targetStatus = REVENUE_CAT_EVENT_STATUS_MAP[event.type];

  if (targetStatus === undefined) {
    Logger.info(`[RevenueCat] Unhandled event type: ${event.type} – skipping.`);
    return;
  }

  // 6. Find or initialise the subscription record
  let subscription = await Subscription.findOne({ user: user._id });

  if (!subscription) {
    subscription = new Subscription({
      user: user._id,
      revenueCatAppUserId: appUserId,
      planType,
      status: SUBSCRIPTION_STATUS.INCOMPLETE,
      currentPeriodStart: purchasedAt,
      // currentPeriodEnd is required by the schema; use expirationAt as a safe default.
      currentPeriodEnd: expirationAt,
      cancelAtPeriodEnd: false,
    });
  }

  // 7. Apply event-specific logic
  switch (event.type) {
    // ── Active / payment events ─────────────────────────────────────────────
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'NON_RENEWING_PURCHASE':
    case 'UNCANCELLATION': {
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      subscription.currentPeriodStart = purchasedAt;
      subscription.currentPeriodEnd = expirationAt;
      subscription.revenueCatEntitlementId = entitlementId;
      subscription.planType = planType;
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();

      // Log a payment history entry only for real payment events
      if (PAYMENT_EVENTS.has(event.type)) {
        await SubscriptionHistory.create({
          user: user._id,
          subscription: subscription._id,
          revenueCatTransactionId: transactionId,
          amount: price,
          currency, // normalised lowercase
          status: 'succeeded',
          billingReason: event.type.toLowerCase(), // e.g. "initial_purchase"
          planType,
          transactionDate: purchasedAt,
        });
      }
      break;
    }

    // ── Cancellation (user disabled auto-renew, still has access) ──────────
    //    Mirrors Stripe's cancel_at_period_end = true.
    //    Status stays ACTIVE; access ends at currentPeriodEnd.
    case 'CANCELLATION': {
      subscription.cancelAtPeriodEnd = true;
      // Do NOT change status here – identical to Stripe's behaviour.
      await subscription.save();
      break;
    }

    // ── Expiration (period ended, no renewal) ──────────────────────────────
    //    Mirrors Stripe's customer.subscription.deleted which sends status "canceled".
    //    We map to CANCELED (not EXPIRED) so both payment providers are consistent.
    case 'EXPIRATION': {
      subscription.status = SUBSCRIPTION_STATUS.CANCELED;
      await subscription.save();

      await SubscriptionHistory.create({
        user: user._id,
        subscription: subscription._id,
        revenueCatTransactionId: transactionId,
        amount: price,
        currency, // normalised lowercase
        status: SUBSCRIPTION_STATUS.CANCELED,
        billingReason: 'billing_issue',
        planType,
        transactionDate: new Date(),
      });
      break;
    }

    // ── Billing issue (payment failed) ─────────────────────────────────────
    //    Mirrors Stripe's invoice.payment_failed → PAST_DUE.
    case 'BILLING_ISSUE': {
      subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
      await subscription.save();

      await SubscriptionHistory.create({
        user: user._id,
        subscription: subscription._id,
        revenueCatTransactionId: transactionId,
        amount: price,
        currency, // normalised lowercase
        status: 'failed',
        billingReason: 'billing_issue',
        planType,
        transactionDate: new Date(),
      });
      break;
    }

    // ── Product change (upgrade / downgrade) ───────────────────────────────
    //    Mirrors Stripe's customer.subscription.updated.
    //    Logs a history entry so billing history stays consistent across providers.
    case 'PRODUCT_CHANGE': {
      subscription.planType = planType;
      subscription.currentPeriodEnd = expirationAt;
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      await subscription.save();

      // Log the plan change so billing history is symmetric with Stripe
      await SubscriptionHistory.create({
        user: user._id,
        subscription: subscription._id,
        revenueCatTransactionId: transactionId,
        amount: price,
        currency, // normalised lowercase
        status: 'succeeded',
        billingReason: 'product_change',
        planType,
        transactionDate: new Date(),
      });
      break;
    }

    // Fallthrough safety net (already handled by the map check above, but kept
    // for exhaustiveness)
    default: {
      Logger.info(`[RevenueCat] No action taken for event type: ${event.type}`);
      break;
    }
  }

  Logger.info(
    `[RevenueCat] Event "${event.type}" processed for user ${appUserId}. ` +
      `Subscription status: ${subscription.status}`,
  );
};

export const RevenueCatService = {
  handleRevenueCatWebhook,
};
