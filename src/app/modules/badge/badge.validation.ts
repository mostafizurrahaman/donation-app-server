import { z } from 'zod';
import {
  BADGE_TIER_VALUES,
  BADGE_UNLOCK_TYPE_VALUES,
  MAX_BADGE_NAME_LENGTH,
  MAX_BADGE_DESCRIPTION_LENGTH,
  MAX_TIER_NAME_LENGTH,
  MIN_REQUIRED_COUNT,
  MAX_REQUIRED_COUNT,
} from './badge.constant';

const badgeTierSchema = z.object({
  tier: z.enum(BADGE_TIER_VALUES as [string, ...string[]]),
  name: z.string().max(MAX_TIER_NAME_LENGTH),
  requiredCount: z.number().min(MIN_REQUIRED_COUNT).max(MAX_REQUIRED_COUNT),
  requiredAmount: z.number().min(0).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const createBadgeSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Badge name is required')
      .max(
        MAX_BADGE_NAME_LENGTH,
        `Badge name cannot exceed ${MAX_BADGE_NAME_LENGTH} characters`
      ),
    description: z
      .string()
      .min(1, 'Description is required')
      .max(
        MAX_BADGE_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MAX_BADGE_DESCRIPTION_LENGTH} characters`
      ),
    icon: z.string().url().optional(),
    tiers: z
      .array(badgeTierSchema)
      .length(4, 'Badge must have exactly 4 tiers'),
    category: z.string().optional(),
    unlockType: z.enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]]),
    targetOrganization: z.string().optional(),
    targetCause: z.string().optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    featured: z.boolean().optional(),
  }),
});

export const updateBadgeSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Badge ID is required'),
  }),
  body: z.object({
    name: z.string().max(MAX_BADGE_NAME_LENGTH).optional(),
    description: z.string().max(MAX_BADGE_DESCRIPTION_LENGTH).optional(),
    icon: z.string().url().optional(),
    tiers: z.array(badgeTierSchema).length(4).optional(),
    category: z.string().optional(),
    unlockType: z
      .enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]])
      .optional(),
    targetOrganization: z.string().optional(),
    targetCause: z.string().optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    featured: z.boolean().optional(),
  }),
});

export const getBadgeByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Badge ID is required'),
  }),
});

export const getBadgesSchema = z.object({
  query: z.object({
    category: z.string().optional(),
    unlockType: z
      .enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]])
      .optional(),
    isActive: z.coerce.boolean().optional(),
    isVisible: z.coerce.boolean().optional(),
    featured: z.coerce.boolean().optional(),
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const deleteBadgeSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Badge ID is required'),
  }),
});

export const assignBadgeSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    badgeId: z.string().min(1, 'Badge ID is required'),
    initialTier: z.enum(BADGE_TIER_VALUES as [string, ...string[]]).optional(),
    initialProgress: z.number().min(0).optional(),
  }),
});

export const getUserBadgesSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
  query: z.object({
    badgeId: z.string().optional(),
    currentTier: z.enum(BADGE_TIER_VALUES as [string, ...string[]]).optional(),
    isCompleted: z.coerce.boolean().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('lastUpdatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const updateBadgeProgressSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
    badgeId: z.string().min(1, 'Badge ID is required'),
  }),
  body: z.object({
    count: z.number().min(1, 'Count must be at least 1'),
    amount: z.number().min(0).optional(),
  }),
});

export const getBadgeStatsSchema = z.object({
  query: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

export const getUserBadgeProgressSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
    badgeId: z.string().min(1, 'Badge ID is required'),
  }),
});
