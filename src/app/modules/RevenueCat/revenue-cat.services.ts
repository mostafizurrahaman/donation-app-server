import httpStatus from 'http-status';
import { AppError } from '../../utils';
import { Subscription } from '../Subscription/subscription.model';
import { SubscriptionHistory } from '../subscriptionHistory/subscriptionHistory.model';
import Auth from '../Auth/auth.model';
import { ROLE } from '../Auth/auth.constant';
import {
  SUBSCRIPTION_STATUS,
  PLAN_TYPE,
} from '../Subscription/subscription.constant';
import config from '../../config';
import { Logger } from '../../utils/logger';

export const handleRevenueCatWebhook = async (
  payload: any,
  authHeader: string,
) => {
  // 1. Verify Webhook Authenticity
  if (authHeader !== config.revenueCat.webhookSecret) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid Webhook Authorization Header',
    );
  }

  const event = payload.event;

  if (!event) return;
  Logger.info(`Event Type [${event.type}]`);
  Logger.info(event);

  const appUserId = event.app_user_id;

  // 2. Fetch User & Enforce "Business Role Only"
  let user;
  try {
    user = await Auth.findById(appUserId);
  } catch (error) {
    console.warn(`[RevenueCat] Invalid app_user_id format: ${appUserId}`);
    return;
  }

  if (!user) {
    console.warn(`[RevenueCat] User not found: ${appUserId}`);
    return;
  }

  if (user.role !== ROLE.BUSINESS) {
    console.warn(
      `[RevenueCat] User is not a BUSINESS. Event Ignored. Role: ${user.role}`,
    );
    return;
  }

  // 3. Extract Event Data
  const transactionId = event.transaction_id;
  const purchasedAt = new Date(event.purchased_at_ms);
  const expirationAt = new Date(event.expiration_at_ms);
  const price = event.price || 0;
  const currency = event.currency || 'USD';
  const entitlementId = event.entitlement_ids?.[0] || 'pro';
  const productId = event.product_id || '';

  // Determine plan type (customize this logic based on your RevenueCat product IDs)
  const planType =
    productId.toLowerCase().includes('year') ||
    productId.toLowerCase().includes('annual')
      ? PLAN_TYPE.YEARLY
      : PLAN_TYPE.MONTHLY;

  // 4. Find or Create Subscription
  let subscription = await Subscription.findOne({ user: user._id });

  if (!subscription) {
    subscription = new Subscription({
      user: user._id,
      revenueCatAppUserId: appUserId,
      planType,
      status: SUBSCRIPTION_STATUS.INCOMPLETE,
      currentPeriodStart: purchasedAt,
      currentPeriodEnd: expirationAt,
      cancelAtPeriodEnd: false,
    });
  }

  // 5. Handle RevenueCat Event Types
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'NON_RENEWING_PURCHASE':
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
      subscription.currentPeriodStart = purchasedAt;
      subscription.currentPeriodEnd = expirationAt;
      subscription.revenueCatEntitlementId = entitlementId;
      subscription.planType = planType;
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();

      // Log Payment History
      if (
        ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'].includes(
          event.type,
        )
      ) {
        await SubscriptionHistory.create({
          user: user._id,
          subscription: subscription._id,
          revenueCatTransactionId: transactionId,
          amount: price,
          currency: currency,
          status: 'succeeded',
          billingReason: event.type.toLowerCase(),
          planType,
          transactionDate: purchasedAt,
        });
      }
      break;

    case 'CANCELLATION':
      // The user turned off auto-renew. They still have access until 'expiration_at_ms'
      subscription.cancelAtPeriodEnd = true;
      await subscription.save();
      break;

    case 'EXPIRATION':
      subscription.status = SUBSCRIPTION_STATUS.EXPIRED;
      await subscription.save();
      break;

    case 'BILLING_ISSUE':
      subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;

      await SubscriptionHistory.create({
        user: user._id,
        subscription: subscription._id,
        revenueCatTransactionId: transactionId,
        amount: price,
        currency: currency,
        status: 'failed',
        billingReason: 'billing_issue',
        planType,
        transactionDate: new Date(),
      });
      await subscription.save();
      break;

    case 'PRODUCT_CHANGE':
      subscription.planType = planType;
      subscription.currentPeriodEnd = expirationAt;
      await subscription.save();
      break;

    default:
      console.log(`[RevenueCat] Unhandled event type: ${event.type}`);
      break;
  }
};

export const RevenueCatService = {
  handleRevenueCatWebhook,
};
