/**
 * src/app/modules/Subscription/subscription.service.ts
 */
import httpStatus from 'http-status';
import { AppError } from '../../utils';
import { stripe } from '../../lib/stripeHelper';

import { Subscription } from './subscription.model';
import Auth from '../Auth/auth.model';
import { SUBSCRIPTION_STATUS } from './subscription.constant';
import { ROLE } from '../Auth/auth.constant';
import { OrganizationModel } from '../Organization/organization.model';
import config from '../../config';
const createSubscriptionSession = async (
  userId: string,
  planType: 'monthly' | 'yearly'
) => {
  const user = await Auth.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // 1. Determine Price ID based on Role and Selection
  let priceId = '';
  if (user.role === ROLE.ORGANIZATION) {
    priceId =
      planType === 'monthly'
        ? config.stripe.orgMonthlyPriceId
        : config.stripe.orgYearlyPriceId;
  } else if (user.role === ROLE.BUSINESS) {
    priceId =
      planType === 'monthly'
        ? config.stripe.bizMonthlyPriceId
        : config.stripe.bizYearlyPriceId;
  }

  if (!priceId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Pricing not configured for your role'
    );
  }

  // 2. Check remaining local trial days to pass to Stripe
  const localSub = await Subscription.findOne({ user: userId });
  let remainingTrialDays = 0;

  if (localSub && localSub.status === SUBSCRIPTION_STATUS.TRIALING) {
    const diff = localSub.currentPeriodEnd.getTime() - new Date().getTime();
    remainingTrialDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // 3. Create Session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    subscription_data: {
      trial_period_days:
        remainingTrialDays > 0 ? remainingTrialDays : undefined,
      // trial_end: Math.floor(Date.now() / 1000 + 5 * 60),
      metadata: { userId, email: user.email },
    },
    success_url: `${config.clientUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.clientUrl}/subscription/cancel`,
    metadata: { userId, email: user.email },
  });

  return { url: session.url };
};

const getMySubscription = async (userId: string) => {
  const sub = await Subscription.findOne({ user: userId });
  if (!sub) return null;

  // Check for auto-expiry of local trial
  const now = new Date();
  if (
    sub.status === SUBSCRIPTION_STATUS.TRIALING &&
    now > sub.currentPeriodEnd
  ) {
    sub.status = SUBSCRIPTION_STATUS.EXPIRED;
    await sub.save();
  }

  return sub;
};

const validateOrganizationAccess = async (orgId: string) => {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw new AppError(httpStatus.NOT_FOUND, 'Org not found');

  const sub = await Subscription.findOne({ user: org.auth });
  const hasAccess =
    sub &&
    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING].includes(
      sub.status as 'active' | 'trialing'
    ) &&
    new Date() < sub.currentPeriodEnd;

  if (!hasAccess) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'The recipient organization cannot receive recurring/round-up donations as their subscription or trial has expired.'
    );
  }
};

const checkHasSubscription = async (orgId: string) => {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw new AppError(httpStatus.NOT_FOUND, 'Org not found');

  const sub = await Subscription.findOne({ user: org.auth });
  const hasSubscription =
    sub &&
    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING].includes(
      sub.status as 'active' | 'trialing'
    ) &&
    new Date() < sub.currentPeriodEnd;

  return !!hasSubscription;
};

export const SubscriptionService = {
  createSubscriptionSession,
  getMySubscription,
  validateOrganizationAccess,
  checkHasSubscription,
};
