// src/app/modules/Reward/reward.validation.ts
import { z } from 'zod';
import {
  REWARD_TYPE_VALUES,
  REWARD_CATEGORY_VALUES,
  REWARD_STATUS_VALUES,
  MIN_REDEMPTION_LIMIT,
  MAX_REDEMPTION_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TERMS_LENGTH,
} from './reward.constant';

const inStoreRedemptionMethodsSchema = z
  .object({
    qrCode: z.boolean().optional(),
    staticCode: z.boolean().optional(),
    nfcTap: z.boolean().optional(),
  })
  .refine((data) => data.qrCode || data.staticCode || data.nfcTap, {
    message: 'At least one in-store redemption method must be selected',
  });

const onlineRedemptionMethodsSchema = z
  .object({
    discountCode: z.boolean().optional(),
    giftCard: z.boolean().optional(),
  })
  .refine((data) => data.discountCode || data.giftCard, {
    message: 'At least one online redemption method must be selected',
  });

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
      image: z.string().url().optional(),
      type: z.enum(REWARD_TYPE_VALUES as [string, ...string[]]),
      category: z.enum(REWARD_CATEGORY_VALUES as [string, ...string[]], {
        message: 'Category is required',
      }),
      redemptionLimit: z
        .number()
        .min(
          MIN_REDEMPTION_LIMIT,
          `Redemption limit must be at least ${MIN_REDEMPTION_LIMIT}`
        )
        .max(
          MAX_REDEMPTION_LIMIT,
          `Redemption limit cannot exceed ${MAX_REDEMPTION_LIMIT}`
        )
        .optional(),
      startDate: z.coerce.date().optional(), // Defaults to now
      expiryDate: z.coerce.date().optional(),
      inStoreRedemptionMethods: inStoreRedemptionMethodsSchema.optional(),
      onlineRedemptionMethods: onlineRedemptionMethodsSchema.optional(),
      terms: z.string().max(MAX_TERMS_LENGTH).optional(),
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
      .min(MIN_REDEMPTION_LIMIT)
      .max(MAX_REDEMPTION_LIMIT)
      .optional(),
    startDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    inStoreRedemptionMethods: inStoreRedemptionMethodsSchema.optional(),
    onlineRedemptionMethods: onlineRedemptionMethodsSchema.optional(),
    terms: z.string().max(MAX_TERMS_LENGTH).optional(),
    featured: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const getRewardByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
});

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
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getRewardsByBusinessSchema = z.object({
  params: z.object({
    businessId: z.string().min(1, 'Business ID is required'),
  }),
  query: z.object({
    type: z.enum(REWARD_TYPE_VALUES as [string, ...string[]]).optional(),
    category: z
      .enum(REWARD_CATEGORY_VALUES as [string, ...string[]])
      .optional(),
    status: z.enum(REWARD_STATUS_VALUES as [string, ...string[]]).optional(),
    featured: z.coerce.boolean().optional(),
    userId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const deleteRewardSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
});

export const uploadCodesSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
});

export const checkAvailabilitySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Reward ID is required'),
  }),
  query: z.object({
    userId: z.string().optional(),
  }),
});

export const getRewardStatsSchema = z.object({
  query: z.object({
    businessId: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});
