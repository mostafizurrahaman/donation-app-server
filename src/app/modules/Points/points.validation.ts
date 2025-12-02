import { z } from 'zod';
import {
  TRANSACTION_TYPE_VALUES,
  POINTS_SOURCE_VALUES,
  MIN_TRANSACTION_AMOUNT,
  MAX_TRANSACTION_AMOUNT,
  MAX_ADJUSTMENT_REASON_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from './points.constant';

export const createTransactionSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    transactionType: z.enum(TRANSACTION_TYPE_VALUES as [string, ...string[]]),
    amount: z
      .number()
      .min(
        MIN_TRANSACTION_AMOUNT,
        `Minimum amount is ${MIN_TRANSACTION_AMOUNT}`
      )
      .max(
        MAX_TRANSACTION_AMOUNT,
        `Maximum amount is ${MAX_TRANSACTION_AMOUNT}`
      ),
    source: z.enum(POINTS_SOURCE_VALUES as [string, ...string[]]),
    donationId: z.string().optional(),
    rewardRedemptionId: z.string().optional(),
    badgeId: z.string().optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    metadata: z.record(z.any(), z.unknown()).optional(),
    adjustedBy: z.string().optional(),
    adjustmentReason: z.string().max(MAX_ADJUSTMENT_REASON_LENGTH).optional(),
    expiresAt: z.coerce.date().optional(),
  }),
});

export const getUserBalanceSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

export const getUserTransactionsSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
  query: z.object({
    transactionType: z
      .enum(TRANSACTION_TYPE_VALUES as [string, ...string[]])
      .optional(),
    source: z.enum(POINTS_SOURCE_VALUES as [string, ...string[]]).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const deductPointsSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    amount: z
      .number()
      .min(
        MIN_TRANSACTION_AMOUNT,
        `Minimum amount is ${MIN_TRANSACTION_AMOUNT}`
      )
      .max(
        MAX_TRANSACTION_AMOUNT,
        `Maximum amount is ${MAX_TRANSACTION_AMOUNT}`
      ),
    source: z.enum(POINTS_SOURCE_VALUES as [string, ...string[]]),
    rewardRedemptionId: z.string().optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    metadata: z.record(z.any(), z.unknown()).optional(),
  }),
});

export const refundPointsSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    amount: z
      .number()
      .min(
        MIN_TRANSACTION_AMOUNT,
        `Minimum amount is ${MIN_TRANSACTION_AMOUNT}`
      )
      .max(
        MAX_TRANSACTION_AMOUNT,
        `Maximum amount is ${MAX_TRANSACTION_AMOUNT}`
      ),
    source: z.enum(POINTS_SOURCE_VALUES as [string, ...string[]]),
    rewardRedemptionId: z.string().optional(),
    reason: z.string().max(MAX_ADJUSTMENT_REASON_LENGTH),
    metadata: z.record(z.any(), z.unknown()).optional(),
  }),
});

export const adjustPointsSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    amount: z.number(), // Can be positive or negative
    reason: z
      .string()
      .min(1, 'Reason is required')
      .max(MAX_ADJUSTMENT_REASON_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  }),
});

export const getTransactionByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Transaction ID is required'),
  }),
});

export const getLeaderboardSchema = z.object({
  query: z.object({
    limit: z.coerce.number().min(1).max(100).default(10),
    tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  }),
});

export const getPointsStatsSchema = z.object({
  query: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

export const checkAffordabilitySchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
  query: z.object({
    amount: z.coerce.number().min(MIN_TRANSACTION_AMOUNT),
  }),
});

export const pointsValidation = {
  createTransactionSchema,
  getUserBalanceSchema,
  getUserTransactionsSchema,
  deductPointsSchema,
  refundPointsSchema,
  adjustPointsSchema,
  getTransactionByIdSchema,
  getLeaderboardSchema,
  getPointsStatsSchema,
  checkAffordabilitySchema,
};
