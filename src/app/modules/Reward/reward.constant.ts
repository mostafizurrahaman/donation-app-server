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

// Validation limits
export const MIN_POINTS_COST = 100; // Minimum 100 points = $1
export const MAX_POINTS_COST = 1000000; // 1 million points = $10,000
export const MIN_REDEMPTION_LIMIT = 1;
export const MAX_REDEMPTION_LIMIT = 10000;
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_TERMS_LENGTH = 2000;
export const MAX_CODE_LENGTH = 50;
export const MAX_CODES_PER_REWARD = 10000;

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
  CREATED: 'Reward created successfully',
  UPDATED: 'Reward updated successfully',
  DELETED: 'Reward deleted successfully',
  ARCHIVED: 'Reward archived successfully',
  NOT_FOUND: 'Reward not found',
  ALREADY_EXISTS: 'Reward with this title already exists for this business',
  INSUFFICIENT_STOCK: 'Reward is out of stock',
  EXPIRED: 'Reward has expired',
  NOT_STARTED: 'Reward is not yet available',
  INACTIVE: 'Reward is currently inactive',
  INSUFFICIENT_POINTS: 'Insufficient points to redeem this reward',
  NO_CODES_AVAILABLE: 'No redemption codes available',
  INVALID_CODE: 'Invalid or already used redemption code',
  CODE_ALREADY_USED: 'This code has already been used',
  BUSINESS_NOT_FOUND: 'Business not found',
  INVALID_REWARD_TYPE: 'Invalid reward type for this operation',
  CODES_UPLOADED: 'Codes uploaded successfully',
} as const;

// CSV upload settings
export const CSV_UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_MIME_TYPES: ['text/csv', 'application/vnd.ms-excel'],
  ENCODING: 'utf-8',
} as const;

// Auto-status update intervals
export const STATUS_UPDATE_INTERVAL = 3600000; // 1 hour in milliseconds

// Searchable fields for text search
export const SEARCHABLE_FIELDS = ['title', 'description', 'terms'];
