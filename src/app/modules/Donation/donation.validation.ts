import { z } from 'zod';

// 2. Get user donations schema (with QueryBuilder support)
const getUserDonationsSchema = z.object({
  query: z.object({
    // Pagination
    page: z.coerce
      .number()
      .min(1, { message: 'Page must be at least 1!' })
      .optional()
      .default(1),

    limit: z.coerce
      .number()
      .min(1, { message: 'Limit must be at least 1!' })
      .max(100, { message: 'Limit cannot exceed 100!' })
      .optional()
      .default(10),

    // QueryBuilder search
    searchTerm: z.string().optional(),

    // QueryBuilder sort
    sort: z.string().optional(),

    // QueryBuilder fields selection
    fields: z.string().optional(),

    // Filters
    status: z
      .enum([
        'pending',
        'processing',
        'completed',
        'failed',
        'refunded',
        'canceled',
        'all',
      ])
      .optional(),

    donationType: z
      .enum(['one-time', 'recurring', 'round-up', 'all'])
      .optional(),
  }),
});

// 3. Get donation by ID schema (params validation)
const getDonationByIdSchema = z.object({
  params: z.object({
    id: z
      .string({
        error: 'Donation ID is required!',
      })
      .min(1, { message: 'Donation ID is required!' }),
  }),
});

// 4. Get organization donations schema (with QueryBuilder support)
const getOrganizationDonationsSchema = z.object({
  params: z.object({
    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),
  }),
  query: z.object({
    // Pagination
    page: z.coerce
      .number()
      .min(1, { message: 'Page must be at least 1!' })
      .optional()
      .default(1),

    limit: z.coerce
      .number()
      .min(1, { message: 'Limit must be at least 1!' })
      .max(100, { message: 'Limit cannot exceed 100!' })
      .optional()
      .default(10),

    // QueryBuilder search
    searchTerm: z.string().optional(),

    // QueryBuilder sort
    sort: z.string().optional(),

    // QueryBuilder fields selection
    fields: z.string().optional(),

    // Filters
    status: z
      .enum([
        'pending',
        'processing',
        'completed',
        'failed',
        'refunded',
        'canceled',
        'all',
      ])
      .optional(),

    donationType: z
      .enum(['one-time', 'recurring', 'round-up', 'all'])
      .optional(),
  }),
});

const getOrganizationCauseStatsSchema = z.object({
  params: z.object({
    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),
  }),
  query: z.object({
    causeId: z
      .string({
        error: 'Cause ID is required!',
      })
      .min(1, { message: 'Cause ID is required!' }),
    year: z.coerce
      .number()
      .int()
      .min(1970, { message: 'Year must be 1970 or later' })
      .max(2100, { message: 'Year must be 2100 or earlier' })
      .optional(),
  }),
});

// 5. Create recurring donation schema
const createRecurringDonationSchema = z.object({
  body: z.object({
    amount: z
      .number({
        error: 'Amount is required!',
      })
      .min(1, { message: 'Amount must be at least $1!' })
      .max(10000, {
        message: 'Amount cannot exceed $10,000 for recurring donations!',
      }),

    // ✅ NEW: Cover Fees checkbox (default true)
    coverFees: z.boolean().optional().default(true),

    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),

    causeId: z
      .string({
        error: 'Cause ID is required!',
      })
      .min(1, { message: 'Cause ID is required!' }),

    frequency: z.enum(
      ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
      {
        error: 'Invalid frequency option!',
      }
    ),

    startDate: z
      .string()
      .datetime({ message: 'Invalid date format!' })
      .refine((date) => new Date(date) > new Date(), {
        message: 'Start date must be in the future!',
      }),

    endDate: z
      .string()
      .datetime({ message: 'Invalid date format!' })
      .optional(),

    causeCategory: z
      .string()
      .max(100, { message: 'Cause category must be less than 100 characters!' })
      .transform((category) => category?.trim())
      .optional(),

    specialMessage: z
      .string()
      .max(500, { message: 'Message must be less than 500 characters!' })
      .transform((message) => message?.trim())
      .optional(),

    // For custom frequency
    customFrequencyDays: z
      .number({
        error: 'Days must be a number!',
      })
      .min(1, { message: 'Custom frequency days must be at least 1!' })
      .optional(),

    customFrequencyWeeks: z
      .number({
        error: 'Weeks must be a number!',
      })
      .min(1, { message: 'Custom frequency weeks must be at least 1!' })
      .optional(),

    customFrequencyMonths: z
      .number({
        error: 'Months must be a number!',
      })
      .min(1, { message: 'Custom frequency months must be at least 1!' })
      .optional(),
  }),
});

// 6. Create round-up schema
const createRoundUpSchema = z.object({
  body: z.object({
    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),

    bankConnectionId: z
      .string({
        error: 'Bank connection ID is required!',
      })
      .min(1, { message: 'Bank connection ID is required!' }),

    thresholdAmount: z
      .union([
        z.enum(['10', '20', '25', '40', '50', 'none'], {
          error: 'Invalid threshold amount!',
        }),
        z
          .number({
            error: 'Custom threshold must be a number!',
          })
          .min(1, { message: 'Custom threshold must be at least $1!' }),
      ])
      .optional(),

    monthlyLimit: z
      .number({
        error: 'Monthly limit must be a number!',
      })
      .min(0, { message: 'Monthly limit must be non-negative!' })
      .max(1000, { message: 'Monthly limit cannot exceed $1000!' })
      .optional(),

    autoDonateTrigger: z.object({
      type: z.enum(['amount', 'days', 'both'], {
        error: 'Invalid trigger type!',
      }),

      amount: z
        .number({
          error: 'Trigger amount must be a number!',
        })
        .min(1, { message: 'Trigger amount must be at least $1!' })
        .optional(),

      days: z
        .number({
          error: 'Trigger days must be a number!',
        })
        .min(1, { message: 'Trigger days must be at least 1!' }),
    }),

    specialMessage: z
      .string()
      .max(500, { message: 'Message must be less than 500 characters!' })
      .transform((message) => message?.trim())
      .optional(),
  }),
});

// 7. Create donation record schema
const createDonationRecordSchema = z.object({
  body: z.object({
    amount: z
      .number({
        error: 'Amount is required!',
      })
      .min(1, { message: 'Amount must be at least $1!' })
      .max(10000, { message: 'Amount cannot exceed $10,000!' }),

    // ✅ NEW: Cover Fees checkbox
    coverFees: z.boolean().optional().default(true),

    causeId: z
      .string({
        error: 'Cause ID is required!',
      })
      .min(1, { message: 'Cause ID is required!' }),

    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),

    specialMessage: z
      .string()
      .max(500, { message: 'Message must be less than 500 characters!' })
      .transform((message) => message?.trim())
      .optional(),

    donationId: z.string().optional(), // For idempotency
  }),
});

// 9. Retry failed payment schema
const retryFailedPaymentSchema = z.object({
  params: z.object({
    donationId: z
      .string({
        error: 'Donation ID is required!',
      })
      .min(1, { message: 'Donation ID is required!' }),
  }),
});

// 11. Cancel donation schema
const cancelDonationSchema = z.object({
  params: z.object({
    id: z
      .string({
        error: 'Donation ID is required!',
      })
      .min(1, { message: 'Donation ID is required!' }),
  }),
});

// 12. Refund donation schema
const refundDonationSchema = z.object({
  params: z.object({
    id: z
      .string({
        error: 'Donation ID is required!',
      })
      .min(1, { message: 'Donation ID is required!' }),
  }),
  body: z.object({
    reason: z
      .string()
      .max(500, { message: 'Reason must be less than 500 characters!' })
      .optional(),
  }),
});

// 10. Webhook payment status update schema (internal use)
const updatePaymentStatusSchema = z.object({
  body: z.object({
    paymentIntentId: z.string({
      error: 'Payment intent ID is required!',
    }),
    status: z.enum(['completed', 'failed'], {
      error: 'Invalid status!',
    }),
    chargeId: z.string().optional(),
    customerId: z.string().optional(),
    failureReason: z
      .string()
      .max(500, { message: 'Failure reason must be less than 500 characters!' })
      .optional(),
    failureCode: z.string().optional(),
  }),
});

// 10. Create one-time donation with PaymentIntent schema
const createOneTimeDonationSchema = z.object({
  body: z.object({
    amount: z
      .number({
        error: 'Amount is required!',
      })
      .min(1, { message: 'Amount must be at least $1!' })
      .max(10000, { message: 'Amount cannot exceed $10,000!' }),

    // ✅ NEW: Cover Fees checkbox (default true for AU)
    coverFees: z.boolean().optional().default(true),

    currency: z
      .string()
      .min(3, { message: 'Currency must be 3 characters (e.g., USD)!' })
      .max(3, { message: 'Currency must be 3 characters (e.g., USD)!' })
      .default('usd')
      .transform((val) => val.toLowerCase()),

    organizationId: z
      .string({
        error: 'Organization ID is required!',
      })
      .min(1, { message: 'Organization ID is required!' }),

    causeId: z
      .string({
        error: 'Cause ID is required',
      })
      .min(1, { message: 'Cause ID is required!' }),

    paymentMethodId: z.string({
      error: 'Payment method ID is required!',
    }),

    specialMessage: z
      .string()
      .max(500, { message: 'Message must be less than 500 characters!' })
      .transform((message) => message?.trim())
      .optional(),
  }),
});

const getDonationAnalyticsSchema = z.object({
  query: z.object({
    filter: z.enum(['today', 'this_week', 'this_month'], {
      message: 'Invalid time period',
    }),
    year: z
      .string()
      .regex(/^\d{4}$/, 'Year must be a 4-digit number')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 2000 && val <= 2100, {
        message: 'Year must be between 2000 and 2100',
      })
      .optional(),
    donationType: z
      .enum(['all', 'one-time', 'recurring', 'roundup'], {
        message:
          'Invalid donation type. Must be: all, one-time, recurring, or roundup',
      })
      .optional()
      .default('all'),
    topDonorsLimit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 1 && val <= 100, {
        message: 'Top donors limit must be between 1 and 100',
      })
      .default(10),
    recentDonorsLimit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 1 && val <= 100, {
        message: 'Recent donors limit must be between 1 and 100',
      })
      .default(10),
  }),
});

const getOrganizationDonationYearlyTrends = z.object({
  query: z.object({
    year: z
      .string()
      .regex(/^\d{4}$/, 'Year must be a 4-digit number')
      .transform(Number)
      .refine((year) => {
        const currentYear = new Date().getFullYear();
        return year >= 2020 && year <= currentYear + 1;
      }, 'Year must be between 2020 and next year'),
  }),
});

export const DonationAnalyticsValidation = {
  getDonationAnalyticsSchema,
};

// Export all schemas as a single object like auth module
export const DonationValidation = {
  createOneTimeDonationSchema,
  getUserDonationsSchema,
  getDonationByIdSchema,
  getOrganizationDonationsSchema,
  getOrganizationCauseStatsSchema,
  createRecurringDonationSchema,
  createRoundUpSchema,
  createDonationRecordSchema,
  retryFailedPaymentSchema,
  updatePaymentStatusSchema,
  cancelDonationSchema,
  refundDonationSchema,
  getDonationAnalyticsSchema,
  getOrganizationDonationYearlyTrends,
};

// Export types for TypeScript inference
export type TCreateOneTimeDonationPayload = z.infer<
  typeof createOneTimeDonationSchema.shape.body
>;
export type TGetUserDonationsQuery = z.infer<
  typeof getUserDonationsSchema.shape.query
>;
export type TGetDonationByIdParams = z.infer<
  typeof getDonationByIdSchema.shape.params
>;
export type TGetOrganizationDonationsParams = z.infer<
  typeof getOrganizationDonationsSchema.shape.params
>;
export type TGetOrganizationDonationsQuery = z.infer<
  typeof getOrganizationDonationsSchema.shape.query
>;
export type TGetOrganizationCauseStatsQuery = z.infer<
  typeof getOrganizationCauseStatsSchema.shape.query
>;
export type TCreateDonationRecordPayload = z.infer<
  typeof createDonationRecordSchema.shape.body
>;
export type TRetryFailedPaymentParams = z.infer<
  typeof retryFailedPaymentSchema.shape.params
>;
export type TUpdatePaymentStatusBody = z.infer<
  typeof updatePaymentStatusSchema.shape.body
>;
export type TCreateOneTimeDonation = z.infer<
  typeof createOneTimeDonationSchema.shape.body
>;
export type TCancelDonationParams = z.infer<
  typeof cancelDonationSchema.shape.params
>;
export type TRefundDonationParams = z.infer<
  typeof refundDonationSchema.shape.params
>;
export type TRefundDonationBody = z.infer<
  typeof refundDonationSchema.shape.body
>;

// Keep response schemas separate for API documentation
export const checkoutSessionResponseSchema = z.object({
  sessionId: z.string(),
  url: z.string().url(),
});

export type CheckoutSessionResponse = z.infer<
  typeof checkoutSessionResponseSchema
>;

export type TGetDonationAnalyticsQuery = z.infer<
  typeof getDonationAnalyticsSchema.shape.query
>;

export type TGetOrganizatinDonationYearlyTrendsQuery = z.infer<
  typeof getOrganizationDonationYearlyTrends.shape.query
>;
