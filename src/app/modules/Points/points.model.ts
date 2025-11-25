import { Schema, model } from 'mongoose';
import {
  IPointsTransaction,
  IPointsTransactionModel,
  IPointsBalance,
  IPointsBalanceModel,
} from './points.interface';
import {
  TRANSACTION_TYPE_VALUES,
  POINTS_SOURCE_VALUES,
  POINTS_TIER_VALUES,
  TIER_THRESHOLDS,
} from './points.constant';

// ==========================================
// Points Transaction Schema
// ==========================================
const pointsTransactionSchema = new Schema<IPointsTransaction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'User is required'],
      index: true,
    },
    transactionType: {
      type: String,
      enum: TRANSACTION_TYPE_VALUES,
      required: [true, 'Transaction type is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    balance: {
      type: Number,
      required: [true, 'Balance is required'],
      min: [0, 'Balance cannot be negative'],
    },
    source: {
      type: String,
      enum: POINTS_SOURCE_VALUES,
      required: [true, 'Source is required'],
      index: true,
    },

    // Reference fields
    donation: {
      type: Schema.Types.ObjectId,
      ref: 'Donation',
      index: true,
    },
    rewardRedemption: {
      type: Schema.Types.ObjectId,
      ref: 'RewardRedemption',
      index: true,
    },
    badge: {
      type: Schema.Types.ObjectId,
      ref: 'Badge',
      index: true,
    },

    // Metadata
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Admin adjustment fields
    adjustedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
    },
    adjustmentReason: {
      type: String,
      maxlength: [500, 'Adjustment reason cannot exceed 500 characters'],
      trim: true,
    },

    // Expiry tracking
    expiresAt: {
      type: Date,
      index: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for optimal performance
pointsTransactionSchema.index({ user: 1, createdAt: -1 });
pointsTransactionSchema.index({ user: 1, transactionType: 1 });
pointsTransactionSchema.index({ user: 1, source: 1 });
pointsTransactionSchema.index({ createdAt: -1 });
pointsTransactionSchema.index({ expiresAt: 1, isExpired: 1 });

export const PointsTransaction = model<IPointsTransactionModel>(
  'PointsTransaction',
  pointsTransactionSchema
);

// ==========================================
// Points Balance Schema
// ==========================================
const pointsBalanceSchema = new Schema<IPointsBalance, IPointsBalanceModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'User is required'],
      unique: true,
      index: true,
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: [0, 'Total earned cannot be negative'],
    },
    totalSpent: {
      type: Number,
      default: 0,
      min: [0, 'Total spent cannot be negative'],
    },
    totalRefunded: {
      type: Number,
      default: 0,
      min: [0, 'Total refunded cannot be negative'],
    },
    totalAdjusted: {
      type: Number,
      default: 0,
    },
    totalExpired: {
      type: Number,
      default: 0,
      min: [0, 'Total expired cannot be negative'],
    },
    currentBalance: {
      type: Number,
      default: 0,
      min: [0, 'Current balance cannot be negative'],
      index: true,
    },

    // Milestone tracking
    lifetimePoints: {
      type: Number,
      default: 0,
      min: [0, 'Lifetime points cannot be negative'],
      index: true,
    },
    currentTier: {
      type: String,
      enum: POINTS_TIER_VALUES,
      default: 'bronze',
    },

    lastTransactionAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Method to update balance
pointsBalanceSchema.methods.updateBalance = async function (
  amount: number
): Promise<void> {
  this.currentBalance += amount;
  this.lastTransactionAt = new Date();

  if (amount > 0) {
    this.lifetimePoints += amount;
  }

  // Update tier based on lifetime points
  this.currentTier = this.getTierByPoints();

  await this.save();
};

// Method to check if user can afford amount
pointsBalanceSchema.methods.canAfford = function (amount: number): boolean {
  return this.currentBalance >= amount;
};

// Method to get tier by points
pointsBalanceSchema.methods.getTierByPoints = function ():
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum' {
  if (this.lifetimePoints >= TIER_THRESHOLDS.PLATINUM) return 'platinum';
  if (this.lifetimePoints >= TIER_THRESHOLDS.GOLD) return 'gold';
  if (this.lifetimePoints >= TIER_THRESHOLDS.SILVER) return 'silver';
  return 'bronze';
};

// Indexes
pointsBalanceSchema.index({ currentBalance: -1 });
pointsBalanceSchema.index({ lifetimePoints: -1 });
pointsBalanceSchema.index({ currentTier: 1 });

export const PointsBalance = model<IPointsBalance, IPointsBalanceModel>(
  'PointsBalance',
  pointsBalanceSchema
);
