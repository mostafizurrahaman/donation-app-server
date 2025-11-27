// src/app/modules/badge/badge.constant.ts

export const BADGE_TIER = {
  ONE_TIER: 'one-tier',
  COLOUR: 'colour',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
} as const;

export const BADGE_TIER_VALUES = Object.values(BADGE_TIER);

export const BADGE_UNLOCK_TYPE = {
  // Donation-based
  DONATION_COUNT: 'donation_count',
  DONATION_AMOUNT: 'donation_amount',
  FIRST_TIME: 'first_time',

  // Category/Cause-based
  CAUSE_SPECIFIC: 'cause_specific',
  CATEGORY_SPECIFIC: 'category_specific',
  ORGANIZATION_SPECIFIC: 'organization_specific',

  // Round-up specific
  ROUND_UP: 'round_up',
  ROUND_UP_AMOUNT: 'round_up_amount',

  // Recurring specific
  RECURRING_STREAK: 'recurring_streak',

  // Frequency & Patterns
  FREQUENCY: 'frequency',
  STREAK: 'streak',
  UNIQUE_CAUSES: 'unique_causes',

  // Time-based
  TIME_BASED: 'time_based',

  // Seasonal
  SEASONAL: 'seasonal',

  // Size-based
  DONATION_SIZE: 'donation_size',

  // Amount threshold
  AMOUNT_THRESHOLD: 'amount_threshold',
} as const;

export const BADGE_UNLOCK_TYPE_VALUES = Object.values(BADGE_UNLOCK_TYPE);

// ✅ UPDATED: Condition logic (both = AND, any_one = OR)
export const CONDITION_LOGIC = {
  BOTH: 'both', // ALL conditions must be met
  ANY_ONE: 'any_one', // ANY ONE condition can be met
} as const;

export const CONDITION_LOGIC_VALUES = Object.values(CONDITION_LOGIC);

// Seasonal periods
export const SEASONAL_PERIOD = {
  RAMADAN: 'ramadan',
  LAYLAT_AL_QADR: 'laylat_al_qadr',
  DHUL_HIJJAH: 'dhul_hijjah',
  WINTER: 'winter',
  ZAKAT_FITR: 'zakat_fitr',
} as const;

export const SEASONAL_PERIOD_VALUES = Object.values(SEASONAL_PERIOD);

// Time ranges
export const TIME_RANGE = {
  MIDNIGHT: 'midnight', // 12am-4am
  MORNING: 'morning', // 6am-12pm
  AFTERNOON: 'afternoon', // 12pm-6pm
  EVENING: 'evening', // 6pm-12am
} as const;

// Badge categories (MUST match Cause categories exactly!)
export const BADGE_CATEGORY = {
  // Islamic & Specific
  WATER: 'Water',
  YOUTH: 'Youth',
  QURAN_EDUCATION: 'Quran Education',
  ZAKAT: 'Zakat',
  FOOD: 'Food',
  SADAQAH: 'Sadaqah',
  MOSQUE_UTILITIES: 'Mosque Utilities',
  REFUGEES: 'Refugees',
  EMERGENCIES: 'Emergencies',

  // General
  EDUCATION: 'Education',
  HEALTH: 'Health',
  EMERGENCY_RELIEF: 'Emergency Relief',
  ENVIRONMENT: 'Environment',
  COMMUNITY: 'Community',
  ANIMAL_WELFARE: 'Animal Welfare',
  ORPHANS: 'Orphans',

  // Special
  ROUND_UP: 'Round-Up',
  SEASONAL: 'Seasonal',
  MILESTONE: 'Milestone',
  FREQUENCY: 'Frequency',
} as const;

export const BADGE_CATEGORY_VALUES = Object.values(BADGE_CATEGORY);

// Tier order
export const TIER_ORDER = ['one-tier', 'colour', 'bronze', 'silver', 'gold'];
export const TIER_ORDER_PROGRESSION = ['colour', 'bronze', 'silver', 'gold'];

// Tier colors
export const TIER_COLORS = {
  'one-tier': '#10B981',
  colour: '#9CA3AF',
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
} as const;

// Validation limits
export const MAX_BADGE_NAME_LENGTH = 100;
export const MAX_BADGE_DESCRIPTION_LENGTH = 500;
export const MAX_TIER_NAME_LENGTH = 50;
export const MIN_REQUIRED_COUNT = 0;
export const MAX_REQUIRED_COUNT = 10000;
export const MIN_REQUIRED_AMOUNT = 0;
export const MAX_REQUIRED_AMOUNT = 100000;

// Pagination
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

// Hijri months
export const HIJRI_MONTHS = {
  MUHARRAM: 1,
  SAFAR: 2,
  RABI_AL_AWWAL: 3,
  RABI_AL_THANI: 4,
  JUMADA_AL_AWWAL: 5,
  JUMADA_AL_THANI: 6,
  RAJAB: 7,
  SHABAN: 8,
  RAMADAN: 9,
  SHAWWAL: 10,
  DHU_AL_QIDAH: 11,
  DHU_AL_HIJJAH: 12,
} as const;
