import { Document, Types } from 'mongoose';
import {
  BADGE_UNLOCK_TYPE,
  BADGE_TIER,
  SEASONAL_PERIOD,
} from './badge.constant';

// --- Admin Configuration ---

export interface IBadgeTierConfig {
  tier: (typeof BADGE_TIER)[keyof typeof BADGE_TIER];
  name: string;
  icon: string; // glb
  animationUrl: string; //  gif
  smallIconUrl: string; // png, jpg
  requiredCount: number;
  requiredAmount?: number;
}

export interface IBadge extends Document {
  name: string;
  description: string;
  icon: string;

  // Logic Engine
  unlockType: (typeof BADGE_UNLOCK_TYPE)[keyof typeof BADGE_UNLOCK_TYPE];
  conditionLogic: 'and' | 'or';

  // Targeting
  specificCategories?: string[];

  // Constraints / Filters
  seasonalPeriod?: (typeof SEASONAL_PERIOD)[keyof typeof SEASONAL_PERIOD];
  timeRange?: { start: number; end: number }; // 0-23

  // Amount Constraints
  minDonationAmount?: number;
  maxDonationAmount?: number;

  // Structure
  tiers: IBadgeTierConfig[];
  isSingleTier: boolean;

  isActive: boolean;
  priority: number;
  featured: boolean;
}

// --- User Progress ---

export interface ITierUnlockHistory {
  tier: string;
  unlockedAt: Date;
}

export interface IPreviewedTier {
  tier: (typeof BADGE_TIER)[keyof typeof BADGE_TIER];
  previewedAt: Date;
}

export interface IUserBadge extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  badge: Types.ObjectId;

  currentTier: string;
  isCompleted: boolean;

  // Atomic Counters
  progressCount: number;
  progressAmount: number;

  // Complex Tracking
  uniqueCategoryNames: string[];
  consecutiveMonths: number;
  lastDonationDate: Date;

  tiersUnlocked: ITierUnlockHistory[];
  previewedTiers: IPreviewedTier[];

  createdAt: Date;
  updatedAt: Date;
}

// --- History / Audit Trail (Optimized) ---
export interface IUserBadgeHistory extends Document {
  user: Types.ObjectId;
  badge: Types.ObjectId;
  userBadge: Types.ObjectId;
  donation: Types.ObjectId;

  // Snapshots for UI optimization (avoids joining Donation table for basic list)
  contributionAmount: number;
  tierAchieved?: string;

  createdAt: Date;
}

// Payloads
export interface ICreateBadgePayload {
  name: string;
  description: string;
  icon: string;
  tiers: IBadgeTierConfig[];
  unlockType: string;
  conditionLogic?: 'and' | 'or';
  specificCategories?: string[];
  seasonalPeriod?: string;
  timeRange?: { start: number; end: number };
  minDonationAmount?: number;
  maxDonationAmount?: number;
  isActive?: boolean;
  featured?: boolean;
}

export interface IUpdateBadgePayload extends Partial<ICreateBadgePayload> {}

export interface IAssignBadgePayload {
  userId: string;
  badgeId: string;
  initialTier?: string;
  initialProgress?: number;
}

export interface IUserBadgeProgress {
  badge: IBadge;
  userBadge?: IUserBadge;
  isUnlocked: boolean;
  currentTier: string;
  nextTier?: IBadgeTierConfig;
  progressCount: number;
  progressAmount?: number;
  progressPercentage: number;
  remainingForNextTier?: number;
}
