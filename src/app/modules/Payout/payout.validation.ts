import { z } from 'zod';

const createPayoutSchema = z.object({
  body: z.object({
    amount: z.number().min(10, 'Minimum payout amount is $10'), // Enforce min withdrawal
    scheduledDate: z
      .string()
      .refine((date) => new Date(date) > new Date(), {
        message: 'Scheduled date must be in the future',
      })
      .optional(), // If not provided, defaults to "now" (or next run)
  }),
});

const updatePayoutStatusSchema = z.object({
  body: z.object({
    status: z.enum(['approved', 'cancelled']),
    notes: z.string().optional(),
  }),
});

export const PayoutValidation = {
  createPayoutSchema,
  updatePayoutStatusSchema,
};
