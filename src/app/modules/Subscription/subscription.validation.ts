import { z } from 'zod';
import { PLAN_TYPE } from './subscription.constant';

const createSessionSchema = z.object({
  body: z.object({
    planType: z.enum([PLAN_TYPE.MONTHLY, PLAN_TYPE.YEARLY], {
      message: 'Plan type must be either monthly or yearly',
    }),
  }),
});

export const SubscriptionValidation = {
  createSessionSchema,
};
