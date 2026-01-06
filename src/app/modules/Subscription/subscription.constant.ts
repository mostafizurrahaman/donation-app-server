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
