// badge.validation.ts
import { z } from 'zod';
import {
  BADGE_TIER_VALUES,
  BADGE_UNLOCK_TYPE_VALUES,
  CONDITION_LOGIC_VALUES,
  SEASONAL_PERIOD_VALUES,
  VALID_CATEGORIES,
  BADGE_UNLOCK_TYPE,
} from './badge.constant';

// Helper to parse JSON strings from form data
const parseJSON = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

// Custom file validation
const fileSchema = z.object({
  fieldname: z.string(),
  originalname: z.string(),
  encoding: z.string(),
  mimetype: z
    .string()
    .refine(
      (mime) =>
        [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ].includes(mime),
      { message: 'Only image files are allowed for badge icons' }
    ),
  size: z
    .number()
    .max(5 * 1024 * 1024, { message: 'File size must be less than 5MB' }),
  destination: z.string(),
  filename: z.string(),
  path: z.string(),
});

const badgeTierSchema = z.object({
  tier: z.enum(BADGE_TIER_VALUES as [string, ...string[]]),
  name: z.string().min(1, 'Tier name is required'),
  requiredCount: z.number().min(0, 'Required count must be non-negative'),
  requiredAmount: z
    .number()
    .min(0, 'Required amount must be non-negative')
    .optional(),
});

// Comprehensive create badge validation
export const createBadgeSchema = z.object({
  // file: fileSchema, // Validate uploaded file
  body: z
    .object({
      name: z
        .string()
        .min(1, 'Badge name is required')
        .max(100, 'Badge name too long'),
      description: z
        .string()
        .min(1, 'Description is required')
        .max(500, 'Description too long'),

      // Parse and validate tiers
      tiers: z.preprocess(
        parseJSON,
        z
          .array(badgeTierSchema)
          .min(1, 'At least one tier is required')
          .max(4, 'Maximum 4 tiers allowed')
          .refine(
            (tiers) => {
              // Validate tier progression
              const tierOrder = ['colour', 'bronze', 'silver', 'gold'];
              const tierIndices = tiers.map((t) => tierOrder.indexOf(t.tier));
              return tierIndices.every(
                (idx, i) => i === 0 || idx > tierIndices[i - 1]
              );
            },
            { message: 'Tiers must be in correct progression order' }
          )
      ),

      unlockType: z.enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]]),
      conditionLogic: z
        .enum(CONDITION_LOGIC_VALUES as [string, ...string[]])
        .optional(),

      // Category validation with context
      specificCategories: z.preprocess(
        parseJSON,
        z
          .array(z.enum(VALID_CATEGORIES as unknown as [string, ...string[]]))
          .optional()
      ),

      // Seasonal validation
      seasonalPeriod: z
        .enum(SEASONAL_PERIOD_VALUES as [string, ...string[]])
        .optional(),

      // Time range validation
      timeRange: z.preprocess(
        parseJSON,
        z
          .object({
            start: z.number().min(0).max(23),
            end: z.number().min(0).max(23),
          })
          .optional()
      ),

      minDonationAmount: z.preprocess(
        (val) => (val ? Number(val) : undefined),
        z.number().positive().optional()
      ),
      maxDonationAmount: z.preprocess(
        (val) => (val ? Number(val) : undefined),
        z.number().positive().optional()
      ),

      isActive: z.preprocess(
        (val) => val === 'true' || val === true,
        z.boolean().optional()
      ),
      featured: z.preprocess(
        (val) => val === 'true' || val === true,
        z.boolean().optional()
      ),
    })
    .superRefine((data, ctx) => {
      // Cross-field validations

      // 1. Validate unlock type specific requirements
      if (
        data.unlockType === BADGE_UNLOCK_TYPE.CATEGORY_SPECIFIC &&
        !data.specificCategories?.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Categories must be specified for category-specific badges',
          path: ['specificCategories'],
        });
      }

      if (
        data.unlockType === BADGE_UNLOCK_TYPE.SEASONAL &&
        !data.seasonalPeriod
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seasonal period must be specified for seasonal badges',
          path: ['seasonalPeriod'],
        });
      }

      if (data.unlockType === BADGE_UNLOCK_TYPE.TIME_BASED && !data.timeRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Time range must be specified for time-based badges',
          path: ['timeRange'],
        });
      }

      // 2. Validate donation amount constraints
      if (
        data.minDonationAmount &&
        data.maxDonationAmount &&
        data.minDonationAmount > data.maxDonationAmount
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Minimum donation amount cannot be greater than maximum',
          path: ['minDonationAmount'],
        });
      }

      // 3. Validate tier requirements based on unlock type
      if (data.unlockType === BADGE_UNLOCK_TYPE.DONATION_AMOUNT) {
        const hasAmountRequirements = data.tiers.some(
          (tier) => tier.requiredAmount && tier.requiredAmount > 0
        );
        if (!hasAmountRequirements) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Donation amount badges must have amount requirements in tiers',
            path: ['tiers'],
          });
        }
      }

      // 4. Validate single tier badges
      if (data.tiers.length === 1 && data.tiers[0].tier !== 'one-tier') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Single tier badges must use "one-tier" tier type',
          path: ['tiers'],
        });
      }
    }),
});

// Update badge validation
export const updateBadgeSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid badge ID format'),
  }),
  file: fileSchema.optional(), // File is optional for updates
  body: z
    .object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().min(1).max(500).optional(),
      isActive: z.preprocess(
        (val) => val === 'true' || val === true,
        z.boolean().optional()
      ),
      featured: z.preprocess(
        (val) => val === 'true' || val === true,
        z.boolean().optional()
      ),
      tiers: z.preprocess(
        parseJSON,
        z.array(badgeTierSchema).min(1).max(4).optional()
      ),
      specificCategories: z.preprocess(
        parseJSON,
        z
          .array(z.enum(VALID_CATEGORIES as unknown as [string, ...string[]]))
          .optional()
      ),
      unlockType: z
        .enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]])
        .optional(),
      conditionLogic: z
        .enum(CONDITION_LOGIC_VALUES as [string, ...string[]])
        .optional(),
      seasonalPeriod: z
        .enum(SEASONAL_PERIOD_VALUES as [string, ...string[]])
        .optional(),
      timeRange: z.preprocess(
        parseJSON,
        z
          .object({
            start: z.number().min(0).max(23),
            end: z.number().min(0).max(23),
          })
          .optional()
      ),
      minDonationAmount: z.preprocess(
        (val) => (val ? Number(val) : undefined),
        z.number().positive().optional()
      ),
      maxDonationAmount: z.preprocess(
        (val) => (val ? Number(val) : undefined),
        z.number().positive().optional()
      ),
    })
    .superRefine((data, ctx) => {
      // Similar cross-field validations as create, but all optional
      if (
        data.minDonationAmount &&
        data.maxDonationAmount &&
        data.minDonationAmount > data.maxDonationAmount
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Minimum donation amount cannot be greater than maximum',
          path: ['minDonationAmount'],
        });
      }
    }),
});

// Query validation for getting badges
export const getBadgesQuerySchema = z.object({
  query: z.object({
    isActive: z.enum(['true', 'false']).optional(),
    featured: z.enum(['true', 'false']).optional(),
    unlockType: z
      .enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]])
      .optional(),
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});
