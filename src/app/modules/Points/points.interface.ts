// src/app/modules/Points/points.interface.ts
import { Document, Types } from 'mongoose';

export interface IPointsTransaction {
  user: Types.ObjectId;
  transactionType: 'earned' | 'spent' | 'refunded' | 'adjusted' | 'expired';
  amount: number;
  balance: number;
  source:
    | 'donation'
    | 'reward_redemption'
    | 'badge_unlock'
    | 'referral'
    | 'admin_adjustment'
    | 'bonus';

  // Reference fields
  donation?: Types.ObjectId;
  rewardRedemption?: Types.ObjectId;
  badge?: Types.ObjectId;

  // Metadata
  description?: string;
  metadata?: Record<string, unknown>; // Fixed: any -> unknown

  // Admin adjustment fields
  adjustedBy?: Types.ObjectId;
  adjustmentReason?: string;

  // Expiry tracking
  expiresAt?: Date;
  isExpired: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface IPointsTransactionModel extends IPointsTransaction, Document {}

export interface IPointsBalance {
  user: Types.ObjectId;
  totalEarned: number;
  totalSpent: number;
  totalRefunded: number;
  totalAdjusted: number;
  totalExpired: number;
  currentBalance: number;

  // Milestone tracking
  lifetimePoints: number;
  currentTier?: 'bronze' | 'silver' | 'gold' | 'platinum';

  lastTransactionAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IPointsBalanceModel extends IPointsBalance, Document {
  updateBalance(amount: number): Promise<void>;
  canAfford(amount: number): boolean;
  getTierByPoints(): 'bronze' | 'silver' | 'gold' | 'platinum';
}

export interface ICreatePointsTransactionPayload {
  userId: Types.ObjectId | string;
  transactionType: 'earned' | 'spent' | 'refunded' | 'adjusted' | 'expired';
  amount: number;
  source:
    | 'donation'
    | 'reward_redemption'
    | 'badge_unlock'
    | 'referral'
    | 'admin_adjustment'
    | 'bonus';
  donationId?: Types.ObjectId | string;
  rewardRedemptionId?: Types.ObjectId | string;
  badgeId?: Types.ObjectId | string;
  description?: string;
  metadata?: Record<string, unknown>; // Fixed: any -> unknown
  adjustedBy?: Types.ObjectId | string;
  adjustmentReason?: string;
  expiresAt?: Date;
}

export interface IPointsFilterQuery {
  userId?: Types.ObjectId | string;
  transactionType?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IPointsStatistics {
  totalUsers: number;
  totalPointsEarned: number;
  totalPointsSpent: number;
  totalPointsExpired: number;
  averagePointsPerUser: number;
  topEarners: Array<{
    user: Types.ObjectId;
    points: number;
  }>;
  pointsBySource: Array<{
    source: string;
    total: number;
  }>;
}

export interface IPointsLeaderboard {
  rank: number;
  user: Types.ObjectId;
  userName: string;
  userImage?: string;
  totalPoints: number;
  tier: string;
}

// New interfaces for better typing
export interface IPointsTransactionResult {
  transaction: IPointsTransactionModel;
  balance: {
    currentBalance: number;
    lifetimePoints: number;
    currentTier: string;
  };
}

export interface IUserPointsSummary {
  balance: {
    currentBalance: number;
    lifetimePoints: number;
    totalEarned: number;
    totalSpent: number;
    currentTier?: string;
  };
  recentTransactions: IPointsTransaction[];
}

export interface IPopulatedUser {
  _id: Types.ObjectId;
  name: string;
  image?: string;
  email?: string;
}
