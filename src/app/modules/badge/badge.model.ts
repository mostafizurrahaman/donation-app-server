import { Schema, model } from 'mongoose';
import {
  IBadge,
  IUserBadge,
  IBadgeTierConfig,
  IUserBadgeHistory,
} from './badge.interface';
import {
  BADGE_TIER_VALUES,
  BADGE_UNLOCK_TYPE_VALUES,
  CONDITION_LOGIC_VALUES,
  SEASONAL_PERIOD_VALUES,
} from './badge.constant';

// ==================================================
// 1. Badge Definition Schema (Admin Config)
// ==================================================

const BadgeTierSchema = new Schema<IBadgeTierConfig>(
  {
    tier: { type: String, enum: BADGE_TIER_VALUES, required: true },
    name: { type: String, required: true },
    requiredCount: { type: Number, default: 0 },
    requiredAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const BadgeSchema = new Schema<IBadge>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },

    unlockType: {
      type: String,
      enum: BADGE_UNLOCK_TYPE_VALUES,
      required: true,
      index: true,
    },
    conditionLogic: {
      type: String,
      enum: CONDITION_LOGIC_VALUES,
      default: 'or',
    },

    specificCategories: {
      type: [String],
      index: true,
      default: [],
    },

    seasonalPeriod: { type: String, enum: [...SEASONAL_PERIOD_VALUES, null] },
    timeRange: {
      start: Number,
      end: Number,
    },
    minDonationAmount: { type: Number },
    maxDonationAmount: { type: Number },

    tiers: [BadgeTierSchema],
    isSingleTier: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 0, index: -1 },
    featured: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Badge = model<IBadge>('Badge', BadgeSchema);

// ==================================================
// 2. User Progress Schema (Current State)
// ==================================================

const UserBadgeSchema = new Schema<IUserBadge>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    badge: {
      type: Schema.Types.ObjectId,
      ref: 'Badge',
      required: true,
      index: true,
    },

    currentTier: { type: String, enum: BADGE_TIER_VALUES, default: 'colour' },
    isCompleted: { type: Boolean, default: false },

    // Atomic Counters (Aggregated)
    progressCount: { type: Number, default: 0 },
    progressAmount: { type: Number, default: 0 },

    // Complex Logic Tracking
    uniqueCategoryNames: [{ type: String }],
    consecutiveMonths: { type: Number, default: 0 },
    lastDonationDate: { type: Date },

    tiersUnlocked: [
      {
        tier: { type: String, enum: BADGE_TIER_VALUES },
        unlockedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Ensure a user only has one progress document per badge
UserBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });

export const UserBadge = model<IUserBadge>('UserBadge', UserBadgeSchema);

// ==================================================
// 3. User Badge History Schema (Audit Trail)
// ==================================================

const UserBadgeHistorySchema = new Schema<IUserBadgeHistory>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    badge: {
      type: Schema.Types.ObjectId,
      ref: 'Badge',
      required: true,
      index: true,
    },
    userBadge: {
      type: Schema.Types.ObjectId,
      ref: 'UserBadge',
      required: true,
    },
    donation: {
      type: Schema.Types.ObjectId,
      ref: 'Donation',
      required: true,
    },

    // Snapshot data for UI optimization (avoids deep population)
    contributionAmount: { type: Number, default: 0 },
    tierAchieved: { type: String }, // Optional: Only set if this donation triggered a new tier
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    versionKey: false,
  }
);

// Compound index for fast history lookup per badge per user
UserBadgeHistorySchema.index({ user: 1, badge: 1, createdAt: -1 });

export const UserBadgeHistory = model<IUserBadgeHistory>(
  'UserBadgeHistory',
  UserBadgeHistorySchema
);
