import httpStatus from 'http-status';
import { Subscription } from '../modules/Subscription/subscription.model';
import { AppError, asyncHandler } from '../utils';
import { ROLE } from '../modules/Auth/auth.constant';
import { SUBSCRIPTION_STATUS } from '../modules/Subscription/subscription.constant';

/**
 * Gatekeeper to ensure the User (Biz/Org) has an active trial or paid plan
 */
export const checkSubscription = () => {
  return asyncHandler(async (req, res, next) => {
    const user = req.user;
    if (user.role === ROLE.ADMIN || user.role === ROLE.CLIENT) return next();

    const sub = await Subscription.findOne({ user: user._id });

    if (!sub) {
      throw new AppError(httpStatus.PAYMENT_REQUIRED, 'No subscription found.');
    }

    // Access is valid if status is 'active' OR 'trialing'
    const isStatusValid = [
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.TRIALING,
    ].includes(sub.status as 'active' | 'trialing');

    const isPeriodValid = new Date() < new Date(sub.currentPeriodEnd);

    if (!isStatusValid || !isPeriodValid) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        'Your subscription or trial has expired.'
      );
    }

    next();
  });
};
