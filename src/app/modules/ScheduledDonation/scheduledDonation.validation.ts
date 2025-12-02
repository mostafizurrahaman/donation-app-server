import { z } from 'zod';

// Custom interval schema (no changes)
const customIntervalSchema = z.object({
  value: z
    .number()
    .int('Interval value must be a whole number')
    .min(1, 'Interval value must be at least 1'),
  unit: z.enum(['days', 'weeks', 'months']),
});

// 1. Create scheduled donation schema
const createScheduledDonationSchema = z.object({
  body: z
    .object({
      organizationId: z
        .string({ message: 'Organization ID is required!' })
        .min(1, 'Organization ID is required!'),
      causeId: z
        .string({ message: 'Cause ID is required!' })
        .min(1, 'Cause ID is required!'),
      amount: z
        .number({ message: 'Amount is required!' })
        .min(0.01, 'Amount must be at least $0.01')
        .positive('Amount must be positive'),

      // ✅ NEW: Fee preference (Default to true in AU)
      coverFees: z.boolean().optional().default(true),

      frequency: z.enum(
        ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
        {
          message: 'Frequency is required!',
        }
      ),
      customInterval: customIntervalSchema.optional(),
      specialMessage: z
        .string()
        .max(500, 'Special message cannot exceed 500 characters')
        .optional(),
      paymentMethodId: z
        .string({ message: 'Payment method ID is required!' })
        .min(1, 'Payment method ID is required!'),
    })
    .refine(
      (data) => {
        // If frequency is 'custom', customInterval must be provided
        if (data.frequency === 'custom') {
          return data.customInterval !== undefined;
        }
        return true;
      },
      {
        message: 'Custom interval is required when frequency is "custom"',
        path: ['customInterval'],
      }
    )
    .refine(
      (data) => {
        // If frequency is not 'custom', customInterval should not be provided
        if (data.frequency !== 'custom' && data.customInterval) {
          return false;
        }
        return true;
      },
      {
        message:
          'Custom interval should only be provided when frequency is "custom"',
        path: ['customInterval'],
      }
    ),
});

// 2. Update scheduled donation schema
const updateScheduledDonationSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Scheduled donation ID is required!' })
      .min(1, 'Scheduled donation ID is required!'),
  }),
  body: z
    .object({
      amount: z
        .number()
        .min(0.01, 'Amount must be at least $0.01')
        .positive('Amount must be positive')
        .optional(),

      coverFees: z.boolean().optional(),

      frequency: z
        .enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'])
        .optional(),
      customInterval: customIntervalSchema.optional(),
      specialMessage: z
        .string()
        .max(500, 'Special message cannot exceed 500 characters')
        .optional(),
      isActive: z.boolean().optional(),
    })
    .refine(
      (data) => {
        // If frequency is 'custom', customInterval must be provided
        if (data.frequency === 'custom') {
          return data.customInterval !== undefined;
        }
        return true;
      },
      {
        message: 'Custom interval is required when frequency is "custom"',
        path: ['customInterval'],
      }
    ),
});

// 3. Get scheduled donation by ID schema
const getScheduledDonationByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Scheduled donation ID is required!' })
      .min(1, 'Scheduled donation ID is required!'),
  }),
});

// 4. Get user scheduled donations schema (with pagination and QueryBuilder support)
const getUserScheduledDonationsSchema = z.object({
  query: z.object({
    // Pagination
    page: z.coerce
      .number()
      .min(1, 'Page must be at least 1!')
      .optional()
      .default(1),
    limit: z.coerce
      .number()
      .min(1, 'Limit must be at least 1!')
      .max(100, 'Limit cannot exceed 100!')
      .optional()
      .default(10),

    // QueryBuilder search
    searchTerm: z.string().optional(),

    // QueryBuilder sort
    sort: z.string().optional(),

    // QueryBuilder fields selection
    fields: z.string().optional(),

    // Filters
    isActive: z.enum(['true', 'false', 'all']).optional().default('all'),
    frequency: z
      .enum([
        'daily',
        'weekly',
        'monthly',
        'quarterly',
        'yearly',
        'custom',
        'all',
      ])
      .optional()
      .default('all'),
  }),
});

// 5. Pause/Resume scheduled donation schema
const toggleScheduledDonationSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Scheduled donation ID is required!' })
      .min(1, 'Scheduled donation ID is required!'),
  }),
});

// 6. Cancel (delete) scheduled donation schema
const cancelScheduledDonationSchema = z.object({
  params: z.object({
    id: z
      .string({ message: 'Scheduled donation ID is required!' })
      .min(1, 'Scheduled donation ID is required!'),
  }),
});

// Type exports
export type TCreateScheduledDonation = z.infer<
  typeof createScheduledDonationSchema
>['body'];

export type TUpdateScheduledDonation = z.infer<
  typeof updateScheduledDonationSchema
>['body'];

// Export validation schemas
export const ScheduledDonationValidation = {
  createScheduledDonationSchema,
  updateScheduledDonationSchema,
  getScheduledDonationByIdSchema,
  getUserScheduledDonationsSchema,
  toggleScheduledDonationSchema,
  cancelScheduledDonationSchema,
};
