export const SUBSCRIPTION_STATUS = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  EXPIRED: 'expired',
} as const;

export const PLAN_TYPE = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export const subscriptionStatusValues = Object.values(SUBSCRIPTION_STATUS);

export const searchableFields = ['planType', 'status'];

export type TSubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];
export type TPlanType = (typeof PLAN_TYPE)[keyof typeof PLAN_TYPE];

export const TRIAL_DURATION_MONTHS = 6;

/**
 * Maps RevenueCat event types to internal subscription statuses.
 *
 * RevenueCat / Stripe parity reference:
 * ─────────────────────────────────────────────────────────────────
 * RevenueCat Event          │ Stripe Equivalent                │ Internal Status
 * ──────────────────────────┼──────────────────────────────────┼─────────────────
 * INITIAL_PURCHASE          │ customer.subscription.created    │ active
 * RENEWAL                   │ invoice.payment_succeeded        │ active
 * NON_RENEWING_PURCHASE     │ (one-time charge)                │ active
 * UNCANCELLATION            │ cancel_at_period_end → false     │ active
 * CANCELLATION              │ cancel_at_period_end → true      │ active (pending cancel)
 * EXPIRATION                │ customer.subscription.deleted    │ canceled  ← KEY FIX
 * BILLING_ISSUE             │ invoice.payment_failed           │ past_due
 * PRODUCT_CHANGE            │ customer.subscription.updated    │ active
 * ─────────────────────────────────────────────────────────────────
 *
 * NOTE: RevenueCat's EXPIRATION is equivalent to Stripe's subscription deletion
 * (end of period reached, no renewal). Both map to CANCELED, not EXPIRED, so
 * the UI/business logic treats them identically.
 */
export const REVENUE_CAT_EVENT_STATUS_MAP: Record<string, TSubscriptionStatus> =
  {
    INITIAL_PURCHASE: SUBSCRIPTION_STATUS.ACTIVE,
    RENEWAL: SUBSCRIPTION_STATUS.ACTIVE,
    NON_RENEWING_PURCHASE: SUBSCRIPTION_STATUS.ACTIVE,
    UNCANCELLATION: SUBSCRIPTION_STATUS.ACTIVE,
    CANCELLATION: SUBSCRIPTION_STATUS.ACTIVE, // Still active, just cancelAtPeriodEnd = true
    EXPIRATION: SUBSCRIPTION_STATUS.CANCELED, // Matches Stripe's customer.subscription.deleted
    BILLING_ISSUE: SUBSCRIPTION_STATUS.PAST_DUE, // Matches Stripe's invoice.payment_failed
    PRODUCT_CHANGE: SUBSCRIPTION_STATUS.ACTIVE,
  };
