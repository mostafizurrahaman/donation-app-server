import { z } from 'zod';
// Update donation status schema
const updateDonationStatusSchema = z.object({
  body: z.object({
    donationId: z
      .string({
        error: 'Donation ID is required!',
      })
      .min(1, { message: 'Donation ID is required!' }),

    status: z.enum(['completed', 'failed', 'refunded'], {
      error: 'Invalid status option!',
    }),

    stripePaymentIntentId: z.string().optional(),

    stripeCustomerId: z.string().optional(),
  }),
});

// Export all schemas as a single object
export const StripeValidation = {
  updateDonationStatusSchema,
};

export type TUpdateDonationStatusPayload = z.infer<
  typeof updateDonationStatusSchema.shape.body
>;
