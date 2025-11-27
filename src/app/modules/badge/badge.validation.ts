// src/app/modules/badge/badge.validation.ts

import { z } from 'zod';
import {
  BADGE_TIER_VALUES,
  BADGE_UNLOCK_TYPE_VALUES,
  CONDITION_LOGIC_VALUES,
  SEASONAL_PERIOD_VALUES,
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
    name: z.string().min(1).max(MAX_BADGE_NAME_LENGTH),
    description: z.string().min(1).max(MAX_BADGE_DESCRIPTION_LENGTH),
    icon: z.string().url().optional(),
    tiers: z
      .array(badgeTierSchema)
      .refine((tiers) => tiers.length === 1 || tiers.length === 4, {
        message: 'Badge must have exactly 1 tier or 4 tiers',
      }),
    isSingleTier: z.boolean().optional(),
    category: z.string().optional(),
    unlockType: z.enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]]),
    // ✅ UPDATED: Use 'both' | 'any_one'
    conditionLogic: z
      .enum(CONDITION_LOGIC_VALUES as [string, ...string[]])
      .optional(),
    targetOrganization: z.string().optional(),
    targetCause: z.string().optional(),
    seasonalPeriod: z
      .enum(SEASONAL_PERIOD_VALUES as [string, ...string[]])
      .optional(),
    timeRange: z
      .object({
        start: z.number().min(0).max(23),
        end: z.number().min(0).max(23),
      })
      .optional(),
    donationFilters: z
      .object({
        maxAmount: z.number().min(0).optional(),
        minAmount: z.number().min(0).optional(),
        donationType: z.enum(['one-time', 'recurring', 'round-up']).optional(),
        specificCategory: z.string().optional(),
        specificCategories: z.array(z.string()).optional(),
      })
      .optional(),
    hijriMonth: z.number().min(1).max(12).optional(),
    hijriDay: z.number().min(1).max(30).optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    featured: z.boolean().optional(),
  }),
});

export const updateBadgeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().max(MAX_BADGE_NAME_LENGTH).optional(),
    description: z.string().max(MAX_BADGE_DESCRIPTION_LENGTH).optional(),
    icon: z.string().url().optional(),
    tiers: z
      .array(badgeTierSchema)
      .refine((tiers) => tiers.length === 1 || tiers.length === 4, {
        message: 'Badge must have exactly 1 tier or 4 tiers',
      })
      .optional(),
    isSingleTier: z.boolean().optional(),
    category: z.string().optional(),
    unlockType: z
      .enum(BADGE_UNLOCK_TYPE_VALUES as [string, ...string[]])
      .optional(),
    conditionLogic: z
      .enum(CONDITION_LOGIC_VALUES as [string, ...string[]])
      .optional(),
    targetOrganization: z.string().optional(),
    targetCause: z.string().optional(),
    seasonalPeriod: z
      .enum(SEASONAL_PERIOD_VALUES as [string, ...string[]])
      .optional(),
    timeRange: z
      .object({
        start: z.number().min(0).max(23),
        end: z.number().min(0).max(23),
      })
      .optional(),
    donationFilters: z
      .object({
        maxAmount: z.number().min(0).optional(),
        minAmount: z.number().min(0).optional(),
        donationType: z.enum(['one-time', 'recurring', 'round-up']).optional(),
        specificCategory: z.string().optional(),
        specificCategories: z.array(z.string()).optional(),
      })
      .optional(),
    hijriMonth: z.number().min(1).max(12).optional(),
    hijriDay: z.number().min(1).max(30).optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    featured: z.boolean().optional(),
  }),
});

export const getBadgeByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
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
    id: z.string().min(1),
  }),
});

export const assignBadgeSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    badgeId: z.string().min(1),
    initialTier: z.enum(BADGE_TIER_VALUES as [string, ...string[]]).optional(),
    initialProgress: z.number().min(0).optional(),
  }),
});

export const getUserBadgesSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
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
    userId: z.string().min(1),
    badgeId: z.string().min(1),
  }),
  body: z.object({
    count: z.number().min(0),
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
    userId: z.string().min(1),
    badgeId: z.string().min(1),
  }),
});
