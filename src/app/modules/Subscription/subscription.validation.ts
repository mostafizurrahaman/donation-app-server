import { z } from 'zod';
import {
  PLAN_TYPE,
  SUBSCRIPTION_STATUS,
  subscriptionStatusValues,
} from './subscription.constant';

const createSessionSchema = z.object({
  body: z.object({
    planType: z.enum([PLAN_TYPE.MONTHLY, PLAN_TYPE.YEARLY], {
      message: 'Plan type must be either monthly or yearly',
    }),
  }),
});

const getSubscriptionAndPaymentSchema = z.object({
  query: z.object({
    planType: z
      .enum([PLAN_TYPE.MONTHLY, PLAN_TYPE.YEARLY], {
        message: 'Plan type must be either monthly or yearly',
      })
      .optional(),
    status: z
      .enum(subscriptionStatusValues, {
        message: `Status must be one of ${subscriptionStatusValues.join(
          ' , '
        )}`,
      })
      .optional(),
    searchTerm: z.string().optional(),
    fromDate: z.date({
      message: 'Invalid Date!',
    }),
    toDate: z
      .date({
        message: 'Invalid Date!',
      })
      .optional(),
    sortBy: z.string().optional(),
    sortOrder: z.string().optional(),
  }),
});

export const SubscriptionValidation = {
  createSessionSchema,
};
