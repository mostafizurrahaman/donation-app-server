export const BADGE_TIER = {
  COLOUR: 'colour',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
} as const;

export const BADGE_TIER_VALUES = Object.values(BADGE_TIER);

export const BADGE_UNLOCK_TYPE = {
  DONATION_COUNT: 'donation_count',
  DONATION_AMOUNT: 'donation_amount',
  CAUSE_SPECIFIC: 'cause_specific',
  ORGANIZATION_SPECIFIC: 'organization_specific',
  FREQUENCY: 'frequency',
  ROUND_UP: 'round_up',
  STREAK: 'streak',
} as const;

export const BADGE_UNLOCK_TYPE_VALUES = Object.values(BADGE_UNLOCK_TYPE);

export const BADGE_CATEGORY = {
  EDUCATION: 'Education',
  HEALTH: 'Health',
  EMERGENCY_RELIEF: 'Emergency Relief',
  ENVIRONMENT: 'Environment',
  COMMUNITY: 'Community',
  ANIMAL_WELFARE: 'Animal Welfare',
  GENERAL: 'General',
} as const;

export const BADGE_CATEGORY_VALUES = Object.values(BADGE_CATEGORY);

// Tier order for progression
export const TIER_ORDER = ['colour', 'bronze', 'silver', 'gold'];

// Tier colors for UI
export const TIER_COLORS = {
  colour: '#9CA3AF', // Gray
  bronze: '#CD7F32', // Bronze
  silver: '#C0C0C0', // Silver
  gold: '#FFD700', // Gold
} as const;

// Default tier configurations (can be overridden per badge)
export const DEFAULT_TIER_REQUIREMENTS = {
  colour: 1,
  bronze: 3,
  silver: 5,
  gold: 10,
} as const;

// Validation limits
export const MAX_BADGE_NAME_LENGTH = 100;
export const MAX_BADGE_DESCRIPTION_LENGTH = 500;
export const MAX_TIER_NAME_LENGTH = 50;
export const MIN_REQUIRED_COUNT = 1;
export const MAX_REQUIRED_COUNT = 1000;

// Pagination defaults
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Messages
export const BADGE_MESSAGES = {
  CREATED: 'Badge created successfully',
  UPDATED: 'Badge updated successfully',
  DELETED: 'Badge deleted successfully',
  NOT_FOUND: 'Badge not found',
  ALREADY_EXISTS: 'Badge with this name already exists',
  ASSIGNED: 'Badge assigned to user successfully',
  TIER_UNLOCKED: 'New badge tier unlocked!',
  BADGE_COMPLETED: 'Badge completed!',
  INVALID_TIER: 'Invalid badge tier',
  USER_BADGE_NOT_FOUND: 'User badge not found',
  ALREADY_ASSIGNED: 'Badge already assigned to user',
  PROGRESS_UPDATED: 'Badge progress updated successfully',
} as const;

// Badge templates (predefined badges)
export const BADGE_TEMPLATES = {
  ROUND_UP_REBEL: {
    name: 'Round-Up Rebel',
    description: "You've turned small change into real change — literally.",
    unlockType: BADGE_UNLOCK_TYPE.ROUND_UP,
    tiers: [
      { tier: BADGE_TIER.COLOUR, name: 'Getting Started', requiredCount: 1 },
      { tier: BADGE_TIER.BRONZE, name: 'Change Maker', requiredCount: 10 },
      { tier: BADGE_TIER.SILVER, name: 'Spare Change Hero', requiredCount: 30 },
      { tier: BADGE_TIER.GOLD, name: 'Round-Up Legend', requiredCount: 100 },
    ],
  },
  STREAK_CHAMPION: {
    name: 'Streak Champion',
    description: 'Consistency is key. Keep up the giving streak!',
    unlockType: BADGE_UNLOCK_TYPE.STREAK,
    tiers: [
      { tier: BADGE_TIER.COLOUR, name: 'Day One', requiredCount: 1 },
      { tier: BADGE_TIER.BRONZE, name: 'Week Warrior', requiredCount: 7 },
      { tier: BADGE_TIER.SILVER, name: 'Month Master', requiredCount: 30 },
      { tier: BADGE_TIER.GOLD, name: 'Unstoppable', requiredCount: 100 },
    ],
  },
  EDUCATION_CHAMPION: {
    name: 'Education Champion',
    description: 'Supporting education and empowering minds.',
    unlockType: BADGE_UNLOCK_TYPE.CAUSE_SPECIFIC,
    category: BADGE_CATEGORY.EDUCATION,
    tiers: [
      { tier: BADGE_TIER.COLOUR, name: 'Learner', requiredCount: 1 },
      { tier: BADGE_TIER.BRONZE, name: 'Supporter', requiredCount: 5 },
      { tier: BADGE_TIER.SILVER, name: 'Advocate', requiredCount: 10 },
      { tier: BADGE_TIER.GOLD, name: 'Champion', requiredCount: 20 },
    ],
  },
  GENEROUS_GIVER: {
    name: 'Generous Giver',
    description: 'Your generosity knows no bounds.',
    unlockType: BADGE_UNLOCK_TYPE.DONATION_COUNT,
    tiers: [
      { tier: BADGE_TIER.COLOUR, name: 'First Step', requiredCount: 1 },
      { tier: BADGE_TIER.BRONZE, name: 'Regular Donor', requiredCount: 5 },
      { tier: BADGE_TIER.SILVER, name: 'Committed Giver', requiredCount: 15 },
      { tier: BADGE_TIER.GOLD, name: 'Philanthropist', requiredCount: 50 },
    ],
  },
} as const;
