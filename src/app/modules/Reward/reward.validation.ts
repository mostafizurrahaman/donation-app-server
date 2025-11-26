// src/app/modules/Reward/reward.validation.ts
import { z } from 'zod';
import {
  REWARD_TYPE_VALUES,
  REWARD_CATEGORY_VALUES,
  REWARD_STATUS_VALUES,
  MIN_POINTS_COST,
  MAX_POINTS_COST,
  MIN_REDEMPTION_LIMIT,
  MAX_REDEMPTION_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TERMS_LENGTH,
  MAX_CODE_LENGTH,
} from './reward.constant';

export const createRewardSchema = z.object({
  body: z
    .object({
      title: z
        .string({ required_error: 'Title is required' })
        .min(1, 'Title is required')
        .max(
          MAX_TITLE_LENGTH,
          `Title cannot exceed ${MAX_TITLE_LENGTH} characters`
        )
        .trim(),
      description: z
        .string({ required_error: 'Description is required' })
        .min(1, 'Description is required')
        .max(
          MAX_DESCRIPTION_LENGTH,
          `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`
        )
        .trim(),
      image: z.string().url('Invalid image URL').optional(),
      type: z.enum(REWARD_TYPE_VALUES as [string, ...string[]], {
        required_error: 'Reward type is required',
        invalid_type_error: 'Invalid reward type',
      }),
      category: z.enum(REWARD_CATEGORY_VALUES as [string, ...string[]], {
        required_error: 'Category is required',
        invalid_type_error: 'Invalid category',
      }),
      pointsCost: z
        .number({ required_error: 'Points cost is required' })
        .int('Points cost must be an integer')
        .min(MIN_POINTS_COST, `Points cost must be at least ${MIN_POINTS_COST}`)
        .max(MAX_POINTS_COST, `Points cost cannot exceed ${MAX_POINTS_COST}`),
      redemptionLimit: z
        .number({ required_error: 'Redemption limit is required' })
        .int('Redemption limit must be an integer')
        .min(
          MIN_REDEMPTION_LIMIT,
          `Redemption limit must be at least ${MIN_REDEMPTION_LIMIT}`
        )
        .max(
          MAX_REDEMPTION_LIMIT,
          `Redemption limit cannot exceed ${MAX_REDEMPTION_LIMIT}`
        ),
      startDate: z.coerce.date({ required_error: 'Start date is required' }),
      expiryDate: z.coerce.date().optional(),
      codes: z
        .array(
          z
            .string()
            .max(
              MAX_CODE_LENGTH,
              `Code cannot exceed ${MAX_CODE_LENGTH} characters`
            )
        )
        .optional(),
      giftCardUrl: z.string().url('Invalid gift card URL').optional(),
      terms: z
        .string()
        .max(
          MAX_TERMS_LENGTH,
          `Terms cannot exceed ${MAX_TERMS_LENGTH} characters`
        )
        .optional(),
      featured: z.boolean().optional().default(false),
    })
    .refine(
      (data) => {
        if (data.expiryDate && data.startDate) {
          return new Date(data.expiryDate) > new Date(data.startDate);
        }
        return true;
      },
      {
        message: 'Expiry date must be after start date',
        path: ['expiryDate'],
      }
    )
    .refine(
      (data) => {
        // For online rewards, either codes or giftCardUrl should be provided
        if (data.type === 'online') {
          return (data.codes && data.codes.length > 0) || data.giftCardUrl;
        }
        return true;
      },
      {
        message: 'Online rewards must have either codes or a gift card URL',
        path: ['codes'],
      }
    ),
});

export const updateRewardSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Reward ID is required' })
      .min(1, 'Reward ID is required'),
  }),
  body: z.object({
    title: z
      .string()
      .min(1, 'Title cannot be empty')
      .max(
        MAX_TITLE_LENGTH,
        `Title cannot exceed ${MAX_TITLE_LENGTH} characters`
      )
      .trim()
      .optional(),
    description: z
      .string()
      .min(1, 'Description cannot be empty')
      .max(
        MAX_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`
      )
      .trim()
      .optional(),
    image: z.string().url('Invalid image URL').optional(),
    category: z
      .enum(REWARD_CATEGORY_VALUES as [string, ...string[]])
      .optional(),
    pointsCost: z
      .number()
      .int('Points cost must be an integer')
      .min(MIN_POINTS_COST, `Points cost must be at least ${MIN_POINTS_COST}`)
      .max(MAX_POINTS_COST, `Points cost cannot exceed ${MAX_POINTS_COST}`)
      .optional(),
    redemptionLimit: z
      .number()
      .int('Redemption limit must be an integer')
      .min(
        MIN_REDEMPTION_LIMIT,
        `Redemption limit must be at least ${MIN_REDEMPTION_LIMIT}`
      )
      .max(
        MAX_REDEMPTION_LIMIT,
        `Redemption limit cannot exceed ${MAX_REDEMPTION_LIMIT}`
      )
      .optional(),
    startDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    codes: z
      .array(
        z
          .string()
          .max(
            MAX_CODE_LENGTH,
            `Code cannot exceed ${MAX_CODE_LENGTH} characters`
          )
      )
      .optional(),
    giftCardUrl: z.string().url('Invalid gift card URL').optional(),
    terms: z
      .string()
      .max(
        MAX_TERMS_LENGTH,
        `Terms cannot exceed ${MAX_TERMS_LENGTH} characters`
      )
      .optional(),
    featured: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const getRewardByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Reward ID is required' })
      .min(1, 'Reward ID is required'),
  }),
  query: z.object({
    userId: z.string().optional(),
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
    minPoints: z.coerce.number().int().min(0).optional(),
    maxPoints: z.coerce.number().int().min(0).optional(),
    featured: z
      .string()
      .transform((val) => val === 'true')
      .or(z.boolean())
      .optional(),
    userId: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getRewardsByBusinessSchema = z.object({
  params: z.object({
    businessId: z
      .string({ required_error: 'Business ID is required' })
      .min(1, 'Business ID is required'),
  }),
  query: getRewardsSchema.shape.query,
});

export const deleteRewardSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Reward ID is required' })
      .min(1, 'Reward ID is required'),
  }),
});

export const uploadCodesSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Reward ID is required' })
      .min(1, 'Reward ID is required'),
  }),
  body: z.object({
    codes: z
      .array(
        z
          .string()
          .max(
            MAX_CODE_LENGTH,
            `Code cannot exceed ${MAX_CODE_LENGTH} characters`
          )
      )
      .min(1, 'At least one code is required')
      .max(1000, 'Cannot upload more than 1000 codes at once'),
  }),
});

export const checkAvailabilitySchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: 'Reward ID is required' })
      .min(1, 'Reward ID is required'),
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
};

// Type exports
export type TCreateRewardPayload = z.infer<typeof createRewardSchema>['body'];
export type TUpdateRewardPayload = z.infer<typeof updateRewardSchema>['body'];
export type TGetRewardsQuery = z.infer<typeof getRewardsSchema>['query'];
