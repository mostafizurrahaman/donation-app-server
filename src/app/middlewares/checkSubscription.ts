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
    

    // Exempt Admin and Clients (Donors)
    if (user.role === ROLE.ADMIN || user.role === ROLE.CLIENT) return next();

    const sub = await Subscription.findOne({ user: user._id });

    

    // 1. Check if record exists
    if (!sub) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        'No subscription or trial found.'
      );
    }

    // 2. Check if Status is Active or Trialing
    const isStatusValid = [
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.TRIALING,
    ].includes(sub.status as 'active' | 'trialing');
   

    // 3. Check if current date is within the allowed period
    const isPeriodValid = new Date() < new Date(sub.currentPeriodEnd);


    if (!isStatusValid || !isPeriodValid) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        'Your 6-month trial or paid subscription has expired. Please subscribe to continue.'
      );
    }

    next();
  });
};
