import { Document, Types } from 'mongoose';

export interface IBadge {
  name: string;
  description: string;
  icon?: string;

  // Tier system
  tiers: IBadgeTier[];

  // Unlock conditions
  category?: string; // Cause category (Education, Health, etc.)
  unlockType:
    | 'donation_count'
    | 'donation_amount'
    | 'cause_specific'
    | 'organization_specific'
    | 'frequency'
    | 'round_up'
    | 'streak';

  // Target criteria
  targetOrganization?: Types.ObjectId;
  targetCause?: Types.ObjectId;

  // Visibility & Status
  isActive: boolean;
  isVisible: boolean;

  // Display settings
  priority: number;
  featured: boolean;

  // Bonus points (optional)
  bonusPoints?: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IBadgeTier {
  tier: 'colour' | 'bronze' | 'silver' | 'gold';
  name: string;
  requiredCount: number; // Number of donations/actions required
  requiredAmount?: number; // Dollar amount (optional)
  icon?: string;
  color?: string;
}

export interface IBadgeModel extends IBadge, Document {
  getNextTier(currentTier: string): IBadgeTier | null;
  getTierByProgress(progress: number): IBadgeTier;
}

export interface IUserBadge {
  user: Types.ObjectId;
  badge: Types.ObjectId;

  // Progress tracking
  currentTier: 'colour' | 'bronze' | 'silver' | 'gold';
  progressCount: number;
  progressAmount?: number;

  // Unlock history
  unlockedAt: Date;
  lastUpdatedAt: Date;
  tiersUnlocked: Array<{
    tier: 'colour' | 'bronze' | 'silver' | 'gold';
    unlockedAt: Date;
  }>;

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserBadgeModel extends IUserBadge, Document {
  updateProgress(count: number, amount?: number): Promise<boolean>;
  unlockNextTier(): Promise<void>;
  checkTierUpgrade(): Promise<boolean>;
}

export interface ICreateBadgePayload {
  name: string;
  description: string;
  icon?: string;
  tiers: IBadgeTier[];
  category?: string;
  unlockType:
    | 'donation_count'
    | 'donation_amount'
    | 'cause_specific'
    | 'organization_specific'
    | 'frequency'
    | 'round_up'
    | 'streak';
  targetOrganization?: Types.ObjectId | string;
  targetCause?: Types.ObjectId | string;
  bonusPoints?: number;
  isActive?: boolean;
  isVisible?: boolean;
  featured?: boolean;
}

export interface IUpdateBadgePayload {
  name?: string;
  description?: string;
  icon?: string;
  tiers?: IBadgeTier[];
  category?: string;
  unlockType?: string;
  targetOrganization?: Types.ObjectId | string;
  targetCause?: Types.ObjectId | string;
  bonusPoints?: number;
  isActive?: boolean;
  isVisible?: boolean;
  featured?: boolean;
}

export interface IAssignBadgePayload {
  userId: Types.ObjectId | string;
  badgeId: Types.ObjectId | string;
  initialTier?: 'colour' | 'bronze' | 'silver' | 'gold';
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
  progressPercentage: number;
  remainingForNextTier?: number;
}
