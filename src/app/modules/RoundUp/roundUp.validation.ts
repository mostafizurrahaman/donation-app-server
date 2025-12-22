import { z } from 'zod';

export const monthlyThresholdSchema = z.union([
  z.literal('no-limit'),
  z.number().min(3, 'Threshold amount must be at least $3'),
]);

// 1. Save Plaid Consent & Create RoundUp Schema
export const savePlaidConsentValidation = z.object({
  body: z.object({
    bankConnectionId: z.string().min(1, 'Bank connection ID is required'),
    organizationId: z.string().min(1, 'Organization ID is required'),
    causeId: z.string().min(1, 'Cause ID is required'),
    monthlyThreshold: monthlyThresholdSchema,

    // ✅ NEW: Fee preference (Default false for RoundUp)
    coverFees: z.boolean().optional().default(false),

    specialMessage: z
      .string()
      .max(250, 'Special message must not exceed 250 characters')
      .optional(),
    paymentMethodId: z.string().min(1, 'Payment method ID is required'),
  }),
});

export const processMonthlyDonationValidation = z.object({
  body: z.object({
    roundUpId: z.string().min(1, 'Round up ID is required'),
    specialMessage: z
      .string()
      .max(250, 'Special message must not exceed 250 characters')
      .optional(),
  }),
});

export const switchCharityValidation = z.object({
  body: z.object({
    roundUpId: z.string().min(1, 'Round up ID is required'),
    newOrganizationId: z.string().min(1, 'New organization ID is required'),
    newCauseId: z.string().min(1, 'New cause ID is required'),
    reason: z.string().optional(),
  }),
});

export const syncTransactionsValidation = z.object({
  body: z.object({
    cursor: z.string().optional(),
  }),
});

export const bankConnectionIdParamValidation = z.object({
  params: z.object({
    bankConnectionId: z.string().min(1, 'Bank connection ID is required'),
  }),
});

export const transactionIdParamValidation = z.object({
  params: z.object({
    transactionId: z.string().min(1, 'Transaction ID is required'),
  }),
});

export const resumeRoundUpValidation = z.object({
  body: z.object({
    roundUpId: z.string().min(1, 'Round up ID is required'),
  }),
});

export const testRoundUpProcessingCronValidation = z.object({
  body: z.object({
    userId: z.string().optional(), // Optional: If provided, process only this user; if not, process all users
  }),
});

export const updateRoundUpSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'RoundUp ID is required'),
  }),
  body: z.object({
    monthlyThreshold: monthlyThresholdSchema.optional(),
    specialMessage: z
      .string()
      .max(250, 'Special message must not exceed 250 characters')
      .optional(),
  }),
});

export const cancelRoundUpSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'RoundUp ID is required'),
  }),
  body: z.object({
    reason: z.string().optional(),
  }),
});

export type SavePlaidConsentInput = z.infer<
  typeof savePlaidConsentValidation
>['body'];
export type ProcessMonthlyDonationInput = z.infer<
  typeof processMonthlyDonationValidation
>['body'];
export type SwitchCharityInput = z.infer<
  typeof switchCharityValidation
>['body'];
export type SyncTransactionsInput = z.infer<
  typeof syncTransactionsValidation
>['body'];
export type BankConnectionIdParamInput = z.infer<
  typeof bankConnectionIdParamValidation
>['params'];
export type TransactionIdParamInput = z.infer<
  typeof transactionIdParamValidation
>['params'];
export type ResumeRoundUpInput = z.infer<
  typeof resumeRoundUpValidation
>['body'];
export type TestRoundUpProcessingCronInput = z.infer<
  typeof testRoundUpProcessingCronValidation
>['body'];
