// src/app/modules/badge/badge.model.ts

import { Schema, model } from 'mongoose';
import {
  IBadge,
  IBadgeDocument,
  IBadgeModel,
  IBadgeTier,
  IUserBadge,
  IUserBadgeDocument,
  IUserBadgeModel,
} from './badge.interface';
import {
  BADGE_TIER_VALUES,
  BADGE_UNLOCK_TYPE_VALUES,
  CONDITION_LOGIC_VALUES,
  MAX_BADGE_NAME_LENGTH,
  MAX_BADGE_DESCRIPTION_LENGTH,
  MAX_TIER_NAME_LENGTH,
  MIN_REQUIRED_COUNT,
  MAX_REQUIRED_COUNT,
  MIN_REQUIRED_AMOUNT,
  MAX_REQUIRED_AMOUNT,
  TIER_ORDER_PROGRESSION,
  SEASONAL_PERIOD_VALUES,
} from './badge.constant';

// ==========================================
// Badge Tier Sub-Schema
// ==========================================
const badgeTierSchema = new Schema<IBadgeTier>(
  {
    tier: {
      type: String,
      enum: BADGE_TIER_VALUES,
      required: [true, 'Tier level is required'],
    },
    name: {
      type: String,
      required: [true, 'Tier name is required'],
      maxlength: MAX_TIER_NAME_LENGTH,
      trim: true,
    },
    requiredCount: {
      type: Number,
      required: [true, 'Required count is required'],
      min: MIN_REQUIRED_COUNT,
      max: MAX_REQUIRED_COUNT,
    },
    requiredAmount: {
      type: Number,
      min: MIN_REQUIRED_AMOUNT,
      max: MAX_REQUIRED_AMOUNT,
    },
    icon: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// ==========================================
// Main Badge Schema
// ==========================================
const badgeSchema = new Schema<IBadgeDocument, IBadgeModel>(
  {
    name: {
      type: String,
      required: [true, 'Badge name is required'],
      unique: true,
      maxlength: MAX_BADGE_NAME_LENGTH,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: MAX_BADGE_DESCRIPTION_LENGTH,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },

    // Tiers (1 or 4 tiers)
    tiers: {
      type: [badgeTierSchema],
      required: [true, 'Badge tiers are required'],
      validate: {
        validator: function (tiers: IBadgeTier[]) {
          return tiers.length === 1 || tiers.length === 4;
        },
        message: 'Badge must have exactly 1 tier or 4 tiers',
      },
    },
    isSingleTier: {
      type: Boolean,
      default: false,
    },

    // Categorization
    category: {
      type: String,
      index: true,
    },

    // Unlock type
    unlockType: {
      type: String,
      enum: BADGE_UNLOCK_TYPE_VALUES,
      required: [true, 'Unlock type is required'],
      index: true,
    },

    // ✅ UPDATED: Condition logic (both = ALL, any_one = ANY)
    conditionLogic: {
      type: String,
      enum: CONDITION_LOGIC_VALUES,
      default: 'both',
    },

    // Target filters
    targetOrganization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    targetCause: {
      type: Schema.Types.ObjectId,
      ref: 'Cause',
      index: true,
    },

    // Seasonal filters
    seasonalPeriod: {
      type: String,
      enum: SEASONAL_PERIOD_VALUES,
      index: true,
    },

    // Time filters
    timeRange: {
      start: {
        type: Number,
        min: 0,
        max: 23,
      },
      end: {
        type: Number,
        min: 0,
        max: 23,
      },
    },

    // Donation filters
    donationFilters: {
      maxAmount: Number,
      minAmount: Number,
      donationType: {
        type: String,
        enum: ['one-time', 'recurring', 'round-up'],
      },
      specificCategory: String,
      specificCategories: [String],
    },

    // Hijri calendar
    hijriMonth: {
      type: Number,
      min: 1,
      max: 12,
    },
    hijriDay: {
      type: Number,
      min: 1,
      max: 30,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Display
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    featured: {
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

// Indexes
badgeSchema.index({ name: 'text', description: 'text' });
badgeSchema.index({ unlockType: 1, category: 1 });
badgeSchema.index({ isActive: 1, isVisible: 1 });
badgeSchema.index({ featured: 1, priority: -1 });
badgeSchema.index({ seasonalPeriod: 1 });
badgeSchema.index({ 'donationFilters.specificCategory': 1 });

// Method: Get next tier
badgeSchema.methods.getNextTier = function (
  currentTier: string
): IBadgeTier | null {
  if (this.isSingleTier) return null;

  const currentIndex = TIER_ORDER_PROGRESSION.indexOf(currentTier);
  if (
    currentIndex === -1 ||
    currentIndex === TIER_ORDER_PROGRESSION.length - 1
  ) {
    return null;
  }

  const nextTierName = TIER_ORDER_PROGRESSION[currentIndex + 1];
  return this.tiers.find((t: IBadgeTier) => t.tier === nextTierName) || null;
};

// ✅ UPDATED: Method to get tier by progress (supports both/any_one logic)
badgeSchema.methods.getTierByProgress = function (
  progress: number,
  amount?: number
): IBadgeTier {
  if (this.isSingleTier) return this.tiers[0];

  const sortedTiers = [...this.tiers].sort(
    (a, b) => b.requiredCount - a.requiredCount
  );

  for (const tier of sortedTiers) {
    let qualifies = false;

    if (this.conditionLogic === 'any_one') {
      // ANY ONE: count OR amount
      qualifies = progress >= tier.requiredCount;
      if (tier.requiredAmount && amount !== undefined) {
        qualifies = qualifies || amount >= tier.requiredAmount;
      }
    } else {
      // BOTH: count AND amount
      qualifies = progress >= tier.requiredCount;
      if (tier.requiredAmount && amount !== undefined) {
        qualifies = qualifies && amount >= tier.requiredAmount;
      }
    }

    if (qualifies) return tier;
  }

  return this.tiers[0];
};

// Pre-save validation
badgeSchema.pre('save', async function (next) {
  if (this.tiers && this.tiers.length === 4) {
    const sortedTiers = [...this.tiers].sort(
      (a, b) => a.requiredCount - b.requiredCount
    );

    const expectedOrder = ['colour', 'bronze', 'silver', 'gold'];
    const isValidOrder = sortedTiers.every(
      (tier, index) => tier.tier === expectedOrder[index]
    );

    if (!isValidOrder) {
      return next(
        new Error(
          'Badge tiers must be in order: colour < bronze < silver < gold'
        )
      );
    }
  }

  this.isSingleTier = this.tiers.length === 1;
  next();
});

export const Badge = model<IBadgeDocument, IBadgeModel>('Badge', badgeSchema);

// ==========================================
// User Badge Schema
// ==========================================

const tierUnlockSchema = new Schema(
  {
    tier: {
      type: String,
      enum: BADGE_TIER_VALUES,
      required: true,
    },
    unlockedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

const seasonalDonationSchema = new Schema(
  {
    period: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    year: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const userBadgeSchema = new Schema<IUserBadgeDocument, IUserBadgeModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'User is required'],
      index: true,
    },
    badge: {
      type: Schema.Types.ObjectId,
      ref: 'Badge',
      required: [true, 'Badge is required'],
      index: true,
    },

    // Progress
    currentTier: {
      type: String,
      enum: BADGE_TIER_VALUES,
      default: 'colour',
    },
    progressCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    progressAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Special tracking
    uniqueCauses: {
      type: [Schema.Types.ObjectId],
      ref: 'Cause',
      default: [],
    },
    consecutiveMonths: {
      type: Number,
      default: 0,
    },
    lastDonationMonth: {
      type: Date,
    },
    seasonalDonations: {
      type: [seasonalDonationSchema],
      default: [],
    },

    // History
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    tiersUnlocked: {
      type: [tierUnlockSchema],
      default: [],
    },

    // Status
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
userBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });
userBadgeSchema.index({ user: 1, currentTier: 1 });
userBadgeSchema.index({ user: 1, isCompleted: 1 });
userBadgeSchema.index({ badge: 1, currentTier: 1 });

// Method: Update progress
userBadgeSchema.methods.updateProgress = async function (
  count: number,
  amount?: number,
  metadata?: {
    causeId?: Schema.Types.ObjectId;
    donationDate?: Date;
    isRecurring?: boolean;
  }
): Promise<boolean> {
  this.progressCount += count;
  if (amount !== undefined) {
    this.progressAmount = (this.progressAmount || 0) + amount;
  }
  this.lastUpdatedAt = new Date();

  if (metadata?.causeId) {
    await this.addUniqueCause(metadata.causeId);
  }

  if (metadata?.donationDate) {
    await this.updateConsecutiveMonths(metadata.donationDate);
  }

  await this.save();
  return this.checkTierUpgrade();
};

// Method: Add unique cause
userBadgeSchema.methods.addUniqueCause = async function (
  causeId: Schema.Types.ObjectId
): Promise<void> {
  if (!this.uniqueCauses) {
    this.uniqueCauses = [];
  }

  const causeIdStr = causeId.toString();
  const exists = this.uniqueCauses.some(
    (c: Schema.Types.ObjectId) => c.toString() === causeIdStr
  );

  if (!exists) {
    this.uniqueCauses.push(causeId);
  }
};

// Method: Update consecutive months
userBadgeSchema.methods.updateConsecutiveMonths = async function (
  donationDate: Date
): Promise<void> {
  const currentMonth = new Date(donationDate);
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  if (!this.lastDonationMonth) {
    this.consecutiveMonths = 1;
    this.lastDonationMonth = currentMonth;
    return;
  }

  const lastMonth = new Date(this.lastDonationMonth);
  const monthsDiff =
    (currentMonth.getFullYear() - lastMonth.getFullYear()) * 12 +
    (currentMonth.getMonth() - lastMonth.getMonth());

  if (monthsDiff === 0) {
    return;
  } else if (monthsDiff === 1) {
    this.consecutiveMonths = (this.consecutiveMonths || 0) + 1;
    this.lastDonationMonth = currentMonth;
  } else {
    this.consecutiveMonths = 1;
    this.lastDonationMonth = currentMonth;
  }
};

// Method: Add seasonal donation
userBadgeSchema.methods.addSeasonalDonation = async function (
  period: string,
  amount: number,
  year: number
): Promise<void> {
  if (!this.seasonalDonations) {
    this.seasonalDonations = [];
  }

  const existing = this.seasonalDonations.find(
    (sd: any) => sd.period === period && sd.year === year
  );

  if (existing) {
    existing.count += 1;
    existing.amount += amount;
  } else {
    this.seasonalDonations.push({
      period,
      count: 1,
      amount,
      year,
    });
  }
};

// Method: Unlock next tier
userBadgeSchema.methods.unlockNextTier = async function (): Promise<void> {
  await this.populate('badge');
  const badge = this.badge as any;

  if (badge.isSingleTier) {
    this.isCompleted = true;
    this.completedAt = new Date();
    this.currentTier = 'one-tier';

    if (!this.tiersUnlocked.some((t: any) => t.tier === 'one-tier')) {
      this.tiersUnlocked.push({
        tier: 'one-tier',
        unlockedAt: new Date(),
      });
    }
    return;
  }

  const currentIndex = TIER_ORDER_PROGRESSION.indexOf(this.currentTier);
  if (
    currentIndex === -1 ||
    currentIndex === TIER_ORDER_PROGRESSION.length - 1
  ) {
    this.isCompleted = true;
    this.completedAt = new Date();
  } else {
    const nextTier = TIER_ORDER_PROGRESSION[currentIndex + 1];
    this.currentTier = nextTier as any;

    this.tiersUnlocked.push({
      tier: nextTier as any,
      unlockedAt: new Date(),
    });

    if (nextTier === 'gold') {
      this.isCompleted = true;
      this.completedAt = new Date();
    }
  }

  await this.save();
};

// ✅ UPDATED: Check tier upgrade (supports both/any_one logic)
userBadgeSchema.methods.checkTierUpgrade = async function (): Promise<boolean> {
  await this.populate('badge');

  const badge = this.badge as any;
  if (!badge || !badge.tiers) return false;

  if (badge.isSingleTier) {
    if (!this.isCompleted) {
      await this.unlockNextTier();
      return true;
    }
    return false;
  }

  const currentIndex = TIER_ORDER_PROGRESSION.indexOf(this.currentTier);
  if (currentIndex === TIER_ORDER_PROGRESSION.length - 1) return false;

  const nextTier = TIER_ORDER_PROGRESSION[currentIndex + 1];
  const nextTierData = badge.tiers.find((t: IBadgeTier) => t.tier === nextTier);

  if (!nextTierData) return false;

  let meetsRequirement = false;

  // ✅ UPDATED: Use 'any_one' instead of 'or'
  if (badge.conditionLogic === 'any_one') {
    // ANY ONE: Either count OR amount is enough
    meetsRequirement = this.progressCount >= nextTierData.requiredCount;
    if (nextTierData.requiredAmount && this.progressAmount !== undefined) {
      meetsRequirement =
        meetsRequirement || this.progressAmount >= nextTierData.requiredAmount;
    }
  } else {
    // BOTH: Both count AND amount must be met
    meetsRequirement = this.progressCount >= nextTierData.requiredCount;
    if (nextTierData.requiredAmount && this.progressAmount !== undefined) {
      meetsRequirement =
        meetsRequirement && this.progressAmount >= nextTierData.requiredAmount;
    }
  }

  if (meetsRequirement) {
    await this.unlockNextTier();
    return true;
  }

  return false;
};

export const UserBadge = model<IUserBadgeDocument, IUserBadgeModel>(
  'UserBadge',
  userBadgeSchema
);
