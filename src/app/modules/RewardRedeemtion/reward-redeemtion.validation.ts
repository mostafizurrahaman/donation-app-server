import { z } from 'zod';
import {
  REDEMPTION_METHOD_VALUES,
  REDEMPTION_STATUS_VALUES,
} from './reward-redeemtion.constant';

// Claim reward schema
const claimRewardSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  body: z.object({
    preferredCodeType: z.enum(['discount', 'giftcard']).optional(),
    idempotencyKey: z.string().max(100).optional(),
  }),
});

// Cancel claimed reward schema
const cancelClaimedRewardSchema = z.object({
  params: z.object({
    redemptionId: z.string().min(1, 'Redemption ID is required'),
  }),
  body: z.object({
    reason: z
      .string()
      .max(500, 'Reason cannot exceed 500 characters')
      .optional(),
  }),
});

// Redeem reward schema (Single Endpoint supports both ID and Code)
const redeemRewardSchema = z.object({
  body: z.object({
    code: z
      .string({
        error: 'Code must be a valid string',
      })
      .optional(), // Static code
    method: z.enum(REDEMPTION_METHOD_VALUES as [string, ...string[]], {
      error: 'Invalid redemption method provided',
    }),
    staffAuthId: z.string({ error: 'staffAuthId is required' }),
  }),
});

// Verify redemption schema (Optional Pre-Check)
const verifyRedemptionSchema = z.object({
  body: z
    .object({
      code: z.string().optional(),
      redemptionId: z.string().optional(),
    })
    .refine((data) => data.code || data.redemptionId, {
      message: "Either 'code' or 'redemptionId' must be provided",
    }),
});

// Get user claimed rewards schema
const getUserClaimedRewardsSchema = z.object({
  query: z.object({
    includeExpired: z.enum(['true', 'false']).optional(),
    status: z
      .enum([...REDEMPTION_STATUS_VALUES] as [string, ...string[]])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().default('claimedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// Get claimed reward by ID schema
const getClaimedRewardByIdSchema = z.object({
  params: z.object({
    redemptionId: z.string().min(1, 'Redemption ID is required'),
  }),
});

export const rewardRedemptionValidation = {
  claimRewardSchema,
  cancelClaimedRewardSchema,
  redeemRewardSchema,
  verifyRedemptionSchema,
  getUserClaimedRewardsSchema,
  getClaimedRewardByIdSchema,
};
