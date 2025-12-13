// src/app/modules/badge/badge.interface.ts

import { Document, Model, Types } from 'mongoose';

export interface IBadge {
  name: string;
  description: string;
  icon?: string;

  // Tier system
  tiers: IBadgeTier[];
  isSingleTier?: boolean;

  // Categorization
  category?: string;

  // Unlock mechanism
  unlockType:
    | 'donation_count'
    | 'donation_amount'
    | 'first_time'
    | 'cause_specific'
    | 'category_specific'
    | 'organization_specific'
    | 'round_up'
    | 'round_up_amount'
    | 'recurring_streak'
    | 'frequency'
    | 'streak'
    | 'unique_causes'
    | 'time_based'
    | 'seasonal'
    | 'donation_size'
    | 'amount_threshold';

  // ✅ UPDATED: Condition logic (both = ALL conditions, any_one = ANY condition)
  conditionLogic?: 'both' | 'any_one';

  // Target filters
  targetOrganization?: Types.ObjectId;
  targetCause?: Types.ObjectId;

  // Seasonal filters
  seasonalPeriod?:
    | 'ramadan'
    | 'laylat_al_qadr'
    | 'dhul_hijjah'
    | 'winter'
    | 'zakat_fitr';

  // Time-based filters
  timeRange?: {
    start: number; // Hour (0-23)
    end: number; // Hour (0-23)
  };

  // Donation filters
  donationFilters?: {
    maxAmount?: number;
    minAmount?: number;
    donationType?: 'one-time' | 'recurring' | 'round-up';
    specificCategory?: string;
    specificCategories?: string[]; // For multiple categories
  };

  // Hijri calendar
  hijriMonth?: number;
  hijriDay?: number;

  // Status
  isActive: boolean;
  isVisible: boolean;

  // Display
  priority: number;
  featured: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface IBadgeTier {
  tier: 'one-tier' | 'colour' | 'bronze' | 'silver' | 'gold';
  name: string;
  requiredCount: number;
  requiredAmount?: number;
  icon?: string;
  color?: string;
}

export interface IBadgeDocument extends IBadge, Document {
  getNextTier(currentTier: string): IBadgeTier | null;
  getTierByProgress(progress: number, amount?: number): IBadgeTier;
}

export interface IBadgeModel extends Model<IBadgeDocument> {}

export interface IUserBadge {
  user: Types.ObjectId;
  badge: Types.ObjectId;

  // Progress
  currentTier: 'one-tier' | 'colour' | 'bronze' | 'silver' | 'gold';
  progressCount: number;
  progressAmount?: number;

  // Special tracking
  uniqueCauses?: Types.ObjectId[];
  consecutiveMonths?: number;
  lastDonationMonth?: Date;
  seasonalDonations?: Array<{
    period: string;
    count: number;
    amount: number;
    year: number;
  }>;

  // History
  unlockedAt: Date;
  lastUpdatedAt: Date;
  tiersUnlocked: Array<{
    tier: 'one-tier' | 'colour' | 'bronze' | 'silver' | 'gold';
    unlockedAt: Date;
  }>;

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserBadgeDocument extends IUserBadge, Document {
  updateProgress(
    count: number,
    amount?: number,
    metadata?: {
      causeId?: Types.ObjectId;
      donationDate?: Date;
      isRecurring?: boolean;
    }
  ): Promise<boolean>;
  unlockNextTier(): Promise<void>;
  checkTierUpgrade(): Promise<boolean>;
  addUniqueCause(causeId: Types.ObjectId): Promise<void>;
  updateConsecutiveMonths(donationDate: Date): Promise<void>;
  addSeasonalDonation(
    period: string,
    amount: number,
    year: number
  ): Promise<void>;
}

export interface IUserBadgeModel extends Model<IUserBadgeDocument> {}

export interface ICreateBadgePayload {
  name: string;
  description: string;
  icon?: string;
  tiers: IBadgeTier[];
  isSingleTier?: boolean;
  category?: string;
  unlockType: IBadge['unlockType'];
  conditionLogic?: 'both' | 'any_one';
  targetOrganization?: Types.ObjectId | string;
  targetCause?: Types.ObjectId | string;
  seasonalPeriod?: IBadge['seasonalPeriod'];
  timeRange?: IBadge['timeRange'];
  donationFilters?: IBadge['donationFilters'];
  hijriMonth?: number;
  hijriDay?: number;
  isActive?: boolean;
  isVisible?: boolean;
  featured?: boolean;
}

export interface IUpdateBadgePayload {
  name?: string;
  description?: string;
  icon?: string;
  tiers?: IBadgeTier[];
  isSingleTier?: boolean;
  category?: string;
  unlockType?: string;
  conditionLogic?: 'both' | 'any_one';
  targetOrganization?: Types.ObjectId | string;
  targetCause?: Types.ObjectId | string;
  seasonalPeriod?: string;
  timeRange?: {
    start: number;
    end: number;
  };
  donationFilters?: {
    maxAmount?: number;
    minAmount?: number;
    donationType?: string;
    specificCategory?: string;
    specificCategories?: string[];
  };
  hijriMonth?: number;
  hijriDay?: number;
  isActive?: boolean;
  isVisible?: boolean;
  featured?: boolean;
}

export interface IAssignBadgePayload {
  userId: Types.ObjectId | string;
  badgeId: Types.ObjectId | string;
  initialTier?: 'one-tier' | 'colour' | 'bronze' | 'silver' | 'gold';
  initialProgress?: number;
}

export interface IBadgeFilterQuery {
  category?: string;
  unlockType?: string;
  isActive?: boolean;
  isVisible?: boolean;
  featured?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IUserBadgeFilterQuery {
  userId?: Types.ObjectId | string;
  badgeId?: Types.ObjectId | string;
  currentTier?: string;
  isCompleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IBadgeStatistics {
  totalBadges: number;
  activeBadges: number;
  totalUserBadges: number;
  completedBadges: number;
  badgesByCategory: Array<{
    category: string;
    count: number;
  }>;
  badgesByType: Array<{
    unlockType: string;
    count: number;
  }>;
  topBadges: Array<{
    badge: Types.ObjectId;
    name: string;
    userCount: number;
  }>;
}

export interface IUserBadgeProgress {
  badge: IBadge;
  userBadge?: IUserBadge;
  isUnlocked: boolean;
  currentTier: string;
  nextTier?: IBadgeTier;
  progressCount: number;
  progressAmount?: number;
  progressPercentage: number;
  remainingForNextTier?: number;
}
