export const BADGE_TIER = {
  ONE_TIER: 'one-tier',
  COLOUR: 'colour',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
} as const;

export const BADGE_TIER_VALUES = Object.values(BADGE_TIER);

export const BADGE_UNLOCK_TYPE = {
  // --- 1. General Milestones ---
  DONATION_COUNT: 'donation_count', // e.g. "First Drop" (1 donation)
  DONATION_AMOUNT: 'donation_amount', // e.g. "Top Contributor" ($2000 total)

  // --- 2. Category Specific ---
  CATEGORY_SPECIFIC: 'category_specific',

  // --- 3. Behavior / Method ---
  ROUND_UP: 'round_up', // "First Round"
  ROUND_UP_AMOUNT: 'round_up_amount', // "Spare Change Hero"
  RECURRING_STREAK: 'recurring_streak', // "Set & Forget"
  DONATION_SIZE: 'donation_size', // "Coffee Change Champ" (Amount < $5)

  // --- 4. Complex / Time ---
  FREQUENCY: 'frequency', // "Monthly Mover" (Consecutive months)
  UNIQUE_CATEGORIES: 'unique_categories', // "Cause Explorer"
  TIME_BASED: 'time_based', // "Midnight Giver"
  SEASONAL: 'seasonal', // "Ramadan", "Winter", "Qurban", "Fitrah"
} as const;

export const BADGE_UNLOCK_TYPE_VALUES = Object.values(BADGE_UNLOCK_TYPE);

export const CONDITION_LOGIC = {
  AND: 'and', // Rare
  OR: 'or', // Standard: "3 donations OR $50"
} as const;

export const CONDITION_LOGIC_VALUES = Object.values(CONDITION_LOGIC);

export const SEASONAL_PERIOD = {
  RAMADAN: 'ramadan',
  LAYLAT_AL_QADR: 'laylat_al_qadr',
  DHUL_HIJJAH: 'dhul_hijjah',
  WINTER: 'winter',
  FITRAH_DEADLINE: 'fitrah_deadline', 
} as const;

export const SEASONAL_PERIOD_VALUES = Object.values(SEASONAL_PERIOD);

export const VALID_CATEGORIES = [
  'water',
  'education',
  'food',
  'youth',
  'orphans',
  'quran_education',
  'health_medical',
  'emergency_relief',
  'shelter_housing',
  'mosque_utilities',
  'zakat',
  'sadaqah',
  'ramadan',
  'qurban',
  'fitrah',
  'admin_operational',
  'refugees',
  'digital_dawah',
  'women_families',
] as const;

export const TIER_ORDER_PROGRESSION = ['colour', 'bronze', 'silver', 'gold'];


export const BADGE_MESSAGES = {
  CREATED: 'Badge created successfully',
  UPDATED: 'Badge updated successfully',
  DELETED: 'Badge deleted successfully',
  NOT_FOUND: 'Badge not found',
  ALREADY_EXISTS: 'Badge with this name already exists',
  ASSIGNED: 'Badge assigned to user successfully',
  PROGRESS_UPDATED: 'Badge progress updated successfully',
  USER_BADGE_NOT_FOUND: 'User badge not found',
  ALREADY_ASSIGNED: 'Badge already assigned to user',
} as const;
