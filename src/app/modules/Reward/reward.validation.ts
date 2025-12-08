// src/app/modules/Reward/reward.validation.ts
import { z } from 'zod';
import {
  REWARD_TYPE_VALUES,
  REWARD_CATEGORY_VALUES,
  REWARD_STATUS_VALUES,
  REDEMPTION_STATUS_VALUES,
  MIN_REDEMPTION_LIMIT,
  MAX_REDEMPTION_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  REDEMPTION_METHOD_VALUES,
} from './reward.constant';

// Helper schemas
const inStoreRedemptionMethodsSchema = z
  .object({
    qrCode: z.boolean().optional(),
    staticCode: z.boolean().optional(),
    nfcTap: z.boolean().optional(),
  })
  .refine((data) => data.qrCode || data.staticCode || data.nfcTap, {
    message: 'At least one in-store redemption method must be selected',
  })
  .nullable();

const onlineRedemptionMethodsSchema = z
  .object({
    discountCode: z.boolean().optional(),
    giftCard: z.boolean().optional(),
  })
  .refine((data) => data.discountCode || data.giftCard, {
    message: 'At least one online redemption method must be selected',
  })
  .nullable();

// Create reward schema
export const createRewardSchema = z.object({
  body: z
    .object({
      businessId: z.string().min(1, 'Business ID is required'),
      title: z
        .string()
        .min(1, 'Title is required')
        .max(
          MAX_TITLE_LENGTH,
          `Title cannot exceed ${MAX_TITLE_LENGTH} characters`
        ),
      description: z
        .string()
        .min(1, 'Description is required')
        .max(
          MAX_DESCRIPTION_LENGTH,
          `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`
        ),
      image: z.string().url('Invalid image URL').optional(),
      type: z.enum(REWARD_TYPE_VALUES as [string, ...string[]], {
        message: 'Invalid reward type',
      }),
      category: z.enum(REWARD_CATEGORY_VALUES as [string, ...string[]], {
        message: 'Invalid category',
      }),
      redemptionLimit: z
        .number()
        .int('Redemption limit must be an integer')
        .min(MIN_REDEMPTION_LIMIT, `Minimum limit is ${MIN_REDEMPTION_LIMIT}`)
        .max(MAX_REDEMPTION_LIMIT, `Maximum limit is ${MAX_REDEMPTION_LIMIT}`)
        .optional(),
      startDate: z.coerce.date().optional(),
      expiryDate: z.coerce.date().optional(),
      inStoreRedemptionMethods: inStoreRedemptionMethodsSchema.optional(),
      onlineRedemptionMethods: onlineRedemptionMethodsSchema.optional(),
      featured: z.boolean().optional(),
    })
    .refine(
      (data) => {
        if (data.type === 'in-store') {
          return !!data.inStoreRedemptionMethods;
        } else if (data.type === 'online') {
          return !!data.onlineRedemptionMethods;
        }
        return true;
      },
      {
        message: 'Redemption methods must match reward type',
      }
    )
    .refine(
      (data) => {
        if (data.expiryDate && data.startDate) {
          return data.expiryDate > data.startDate;
        }
        return true;
      },
      {
        message: 'Expiry date must be after start date',
        path: ['expiryDate'],
      }
    ),
});

// Update reward schema
export const updateRewardSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  body: z.object({
    title: z.string().max(MAX_TITLE_LENGTH).optional(),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    image: z.string().url().optional(),
    category: z
      .enum(REWARD_CATEGORY_VALUES as [string, ...string[]])
      .optional(),
    redemptionLimit: z
      .number()
      .int()
      .min(MIN_REDEMPTION_LIMIT)
      .max(MAX_REDEMPTION_LIMIT)
      .optional(),
    startDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    inStoreRedemptionMethods: inStoreRedemptionMethodsSchema.optional(),
    onlineRedemptionMethods: onlineRedemptionMethodsSchema.optional(),
    featured: z.boolean().optional(),
    isActive: z.boolean().optional(),
    updateReason: z.string().max(500).optional(),
  }),
});

// Get reward by ID schema
export const getRewardByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  query: z.object({
    userId: z.string().optional(),
  }),
});

// Get rewards schema
export const getRewardsSchema = z.object({
  query: z.object({
    businessId: z.string().optional(),
    type: z.enum(REWARD_TYPE_VALUES as [string, ...string[]]).optional(),
    category: z
      .enum(REWARD_CATEGORY_VALUES as [string, ...string[]])
      .optional(),
    status: z.enum(REWARD_STATUS_VALUES as [string, ...string[]]).optional(),
    featured: z.coerce.boolean().optional(),
    userId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// Get rewards by business schema
export const getRewardsByBusinessSchema = z.object({
  params: z.object({
    businessId: z.string().min(1, 'Business ID is required'),
  }),
  query: getRewardsSchema.shape.query,
});

// Delete reward schema
export const deleteRewardSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
});

// Upload codes schema
export const uploadCodesSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
});

// Check availability schema
export const checkAvailabilitySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  query: z.object({
    userId: z.string().optional(),
  }),
});

// Get reward stats schema
export const getRewardStatsSchema = z.object({
  query: z.object({
    businessId: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

// Claim reward schema
export const claimRewardSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  body: z.object({
    preferredCodeType: z.enum(['discount', 'giftcard']).optional(),
    idempotencyKey: z.string().max(100).optional(),
  }),
});

// Cancel claimed reward schema
export const cancelClaimedRewardSchema = z.object({
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
export const redeemRewardSchema = z.object({
  body: z
    .object({
      redemptionId: z.string().optional(), // ID from QR
      code: z.string({
        error: 'Code must be a valid string',
      }), // Static code
      location: z.string().max(200).optional(),
      notes: z.string().max(500).optional(),
      method: z.enum(REDEMPTION_METHOD_VALUES as [string, ...string[]], {
        error: 'Invalid redemption method provided',
      }),
    })
    .refine((data) => data.redemptionId || data.code, {
      message: "Either 'redemptionId' or 'code' is required",
    }),
});

// Verify redemption schema (Optional Pre-Check)
export const verifyRedemptionSchema = z.object({
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
export const getUserClaimedRewardsSchema = z.object({
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
export const getClaimedRewardByIdSchema = z.object({
  params: z.object({
    redemptionId: z.string().min(1, 'Redemption ID is required'),
  }),
});

// Export validation object
export const rewardValidation = {
  createRewardSchema,
  updateRewardSchema,
  getRewardByIdSchema,
  getRewardsSchema,
  getRewardsByBusinessSchema,
  deleteRewardSchema,
  uploadCodesSchema,
  checkAvailabilitySchema,
  getRewardStatsSchema,
  // Claim/redeem validations
  claimRewardSchema,
  cancelClaimedRewardSchema,
  redeemRewardSchema,
  getUserClaimedRewardsSchema,
  getClaimedRewardByIdSchema,
  verifyRedemptionSchema,
};
