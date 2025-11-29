// src/app/modules/Reward/reward.constant.ts

export const REWARD_TYPE = {
  IN_STORE: 'in-store',
  ONLINE: 'online',
} as const;

export const REWARD_TYPE_VALUES = Object.values(REWARD_TYPE);

export const REWARD_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  UPCOMING: 'upcoming',
  SOLD_OUT: 'sold-out',
} as const;

export const REWARD_STATUS_VALUES = Object.values(REWARD_STATUS);

export const REWARD_CATEGORY = {
  FOOD: 'food',
  CLOTHING: 'clothing',
  GROCERIES: 'groceries',
  HEALTH: 'health',
  BEAUTY: 'beauty',
  ELECTRONICS: 'electronics',
  ENTERTAINMENT: 'entertainment',
  TRAVEL: 'travel',
  FITNESS: 'fitness',
  EDUCATION: 'education',
  OTHER: 'other',
} as const;

export const REWARD_CATEGORY_VALUES = Object.values(REWARD_CATEGORY);

export const REDEMPTION_METHOD = {
  QR_CODE: 'qr',
  NFC: 'nfc',
  STATIC_CODE: 'static-code',
  DISCOUNT_CODE: 'discount-code',
  GIFT_CARD: 'gift-card',
} as const;

export const REDEMPTION_METHOD_VALUES = Object.values(REDEMPTION_METHOD);

// Redemption status
export const REDEMPTION_STATUS = {
  CLAIMED: 'claimed',
  REDEEMED: 'redeemed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export const REDEMPTION_STATUS_VALUES = Object.values(REDEMPTION_STATUS);

// Static points cost for all rewards
export const STATIC_POINTS_COST = 500;

// Validation limits
export const MIN_REDEMPTION_LIMIT = 1;
export const MAX_REDEMPTION_LIMIT = 10000;
export const MAX_TITLE_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_TERMS_LENGTH = 2000;
export const MAX_CODE_LENGTH = 500;
export const MAX_CODES_PER_UPLOAD = 10000;

// Time limits
export const CLAIM_EXPIRY_DAYS = 30;
export const CANCELLATION_WINDOW_HOURS = 24;
export const LIMIT_UPDATE_COOLDOWN_HOURS = 24;

// Pagination defaults
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Priority levels
export const PRIORITY_LEVELS = {
  LOW: 1,
  MEDIUM: 5,
  HIGH: 10,
} as const;

// Messages
export const REWARD_MESSAGES = {
  // Success messages
  CREATED: 'Reward created successfully',
  UPDATED: 'Reward updated successfully',
  DELETED: 'Reward deleted successfully',
  ARCHIVED: 'Reward archived successfully',
  CLAIMED: 'Reward claimed successfully! Your points have been deducted.',
  REDEEMED: 'Reward redeemed successfully',
  CANCELLED: 'Reward claim cancelled and points refunded',
  CODES_UPLOADED: 'Codes uploaded successfully',

  // Error messages
  NOT_FOUND: 'Reward not found',
  REDEMPTION_NOT_FOUND: 'Reward redemption not found',
  ALREADY_EXISTS: 'Reward with this title already exists for this business',
  INSUFFICIENT_STOCK: 'Reward is out of stock',
  EXPIRED: 'Reward has expired',
  NOT_STARTED: 'Reward is not yet available',
  INACTIVE: 'Reward is currently inactive',
  INSUFFICIENT_POINTS: 'Insufficient points to redeem this reward',
  NO_CODES_AVAILABLE: 'No redemption codes available',
  INVALID_CODE: 'Invalid or already used redemption code',
  CODE_ALREADY_USED: 'This code has already been used',
  INVALID_TYPE: 'Invalid reward type',
  INVALID_CSV_FORMAT: 'Invalid CSV format',
  CATEGORY_REQUIRED: 'Category is required',
  INVALID_REDEMPTION_METHODS: 'Invalid redemption methods for reward type',
  ALREADY_CLAIMED: 'You have already claimed this reward',
  CLAIM_NOT_FOUND: 'Reward claim not found',
  CANCELLATION_EXPIRED: 'Cancellation period has expired (24 hours)',
  ALREADY_REDEEMED: 'This reward has already been redeemed',
  LIMIT_BELOW_REDEEMED:
    'Cannot set redemption limit below already redeemed count',
  CANNOT_EXTEND_EXPIRED: 'Cannot extend an already expired reward',
  DUPLICATE_CODES: 'Some codes already exist in other rewards',
  RACE_CONDITION: 'Reward is no longer available. Please try again',
  UPDATE_COOLDOWN: 'Redemption limit can only be updated once every 24 hours',
  INVALID_LIMIT: 'Invalid redemption limit',
  FILE_REQUIRED: 'Codes file is required for online rewards',
  LIMIT_EXCEEDS_CODES: 'Redemption limit cannot exceed available codes',
  CANNOT_REDEEM_NON_CLAIMED: 'Can only redeem claimed rewards',
  CLAIM_EXPIRED: 'This reward claim has expired',
  CODE_GENERATION_FAILED: 'Failed to generate sufficient codes',
  BUSINESS_NOT_FOUND: 'Business not found',
  INVALID_DATES: 'Invalid date configuration',
  START_DATE_PAST: 'Start date cannot be in the past for new rewards',
  EXPIRY_BEFORE_START: 'Expiry date must be after start date',
} as const;

// URL validation regex
export const URL_REGEX =
  /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
