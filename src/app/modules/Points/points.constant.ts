export const TRANSACTION_TYPE = {
  EARNED: 'earned',
  SPENT: 'spent',
  REFUNDED: 'refunded',
  ADJUSTED: 'adjusted',
  EXPIRED: 'expired',
} as const;

export const TRANSACTION_TYPE_VALUES = Object.values(TRANSACTION_TYPE);

export const POINTS_SOURCE = {
  DONATION: 'donation',
  REWARD_REDEMPTION: 'reward_redemption',
  BADGE_UNLOCK: 'badge_unlock',
  REFERRAL: 'referral',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
  BONUS: 'bonus',
} as const;

export const POINTS_SOURCE_VALUES = Object.values(POINTS_SOURCE);

export const POINTS_TIER = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
} as const;

export const POINTS_TIER_VALUES = Object.values(POINTS_TIER);

// Points calculation rules
export const POINTS_PER_DOLLAR = 100; // $1 = 100 points

// Tier thresholds (lifetime points)
export const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 10000, // $100 donated
  GOLD: 50000, // $500 donated
  PLATINUM: 100000, // $1000 donated
} as const;

// Points expiry (optional - set to null if no expiry)
export const POINTS_EXPIRY_DAYS = null; // Set to number if you want points to expire

// Transaction descriptions
export const TRANSACTION_DESCRIPTIONS = {
  DONATION_EARNED: 'Points earned from donation',
  REWARD_REDEEMED: 'Points spent on reward redemption',
  REWARD_REFUNDED: 'Points refunded from cancelled redemption',
  BADGE_UNLOCKED: 'Bonus points for unlocking badge',
  ADMIN_ADJUSTED: 'Admin adjustment',
  REFERRAL_BONUS: 'Referral bonus points',
  EXPIRED: 'Points expired',
} as const;

// Validation limits
export const MIN_TRANSACTION_AMOUNT = 1;
export const MAX_TRANSACTION_AMOUNT = 1000000; // 1 million points
export const MAX_ADJUSTMENT_REASON_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 500;

// Pagination defaults
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Leaderboard settings
export const LEADERBOARD_SIZE = 100;
export const LEADERBOARD_CACHE_TTL = 3600; // 1 hour in seconds

export const POINTS_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Insufficient points balance',
  TRANSACTION_SUCCESS: 'Points transaction completed successfully',
  BALANCE_UPDATED: 'Points balance updated successfully',
  INVALID_AMOUNT: 'Invalid transaction amount',
  USER_NOT_FOUND: 'User not found',
  TRANSACTION_NOT_FOUND: 'Transaction not found',
  BALANCE_NOT_FOUND: 'Points balance not found',
  NEGATIVE_BALANCE: 'Transaction would result in negative balance',
} as const;
