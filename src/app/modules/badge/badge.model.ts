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
  MAX_BADGE_NAME_LENGTH,
  MAX_BADGE_DESCRIPTION_LENGTH,
  MAX_TIER_NAME_LENGTH,
  MIN_REQUIRED_COUNT,
  MAX_REQUIRED_COUNT,
  TIER_ORDER,
} from './badge.constant';

// Badge Tier Sub-Schema
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
      maxlength: [
        MAX_TIER_NAME_LENGTH,
        `Tier name cannot exceed ${MAX_TIER_NAME_LENGTH} characters`,
      ],
      trim: true,
    },
    requiredCount: {
      type: Number,
      required: [true, 'Required count is required'],
      min: [
        MIN_REQUIRED_COUNT,
        `Required count must be at least ${MIN_REQUIRED_COUNT}`,
      ],
      max: [
        MAX_REQUIRED_COUNT,
        `Required count cannot exceed ${MAX_REQUIRED_COUNT}`,
      ],
    },
    requiredAmount: {
      type: Number,
      min: [0, 'Required amount cannot be negative'],
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

// Main Badge Schema
const badgeSchema = new Schema<IBadgeDocument, IBadgeModel>(
  {
    name: {
      type: String,
      required: [true, 'Badge name is required'],
      unique: true,
      maxlength: [
        MAX_BADGE_NAME_LENGTH,
        `Badge name cannot exceed ${MAX_BADGE_NAME_LENGTH} characters`,
      ],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [
        MAX_BADGE_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MAX_BADGE_DESCRIPTION_LENGTH} characters`,
      ],
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },

    // Tier system (must have all 4 tiers)
    tiers: {
      type: [badgeTierSchema],
      required: [true, 'Badge tiers are required'],
      validate: {
        validator: function (tiers: IBadgeTier[]) {
          return tiers.length === 4;
        },
        message:
          'Badge must have exactly 4 tiers (colour, bronze, silver, gold)',
      },
    },

    // Unlock conditions
    category: {
      type: String,
      index: true,
    },
    unlockType: {
      type: String,
      enum: BADGE_UNLOCK_TYPE_VALUES,
      required: [true, 'Unlock type is required'],
      index: true,
    },

    // Target criteria
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

    // Visibility & Status
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

    // Display settings
    priority: {
      type: Number,
      default: 1,
      min: [1, 'Priority must be at least 1'],
      max: [10, 'Priority cannot exceed 10'],
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

// Method to get next tier
badgeSchema.methods.getNextTier = function (
  currentTier: string
): IBadgeTier | null {
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === TIER_ORDER.length - 1) {
    return null;
  }

  const nextTierName = TIER_ORDER[currentIndex + 1];
  return this.tiers.find((t: IBadgeTier) => t.tier === nextTierName) || null;
};

// Method to get tier by progress
badgeSchema.methods.getTierByProgress = function (
  progress: number
): IBadgeTier {
  // Sort tiers by required count (descending)
  const sortedTiers = [...this.tiers].sort(
    (a, b) => b.requiredCount - a.requiredCount
  );

  // Find the highest tier the user qualifies for
  for (const tier of sortedTiers) {
    if (progress >= tier.requiredCount) {
      return tier;
    }
  }

  // Default to colour tier
  return this.tiers[0];
};

// Validation: Ensure tiers are in ascending order
badgeSchema.pre('save', async function (next) {
  if (this.tiers && this.tiers.length === 4) {
    // Sort tiers by required count
    const sortedTiers = [...this.tiers].sort(
      (a, b) => a.requiredCount - b.requiredCount
    );

    // Check if they match the expected order
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

    // Progress tracking
    currentTier: {
      type: String,
      enum: BADGE_TIER_VALUES,
      default: 'colour',
    },
    progressCount: {
      type: Number,
      default: 0,
      min: [0, 'Progress count cannot be negative'],
    },
    progressAmount: {
      type: Number,
      default: 0,
      min: [0, 'Progress amount cannot be negative'],
    },

    // Unlock history
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

// Compound indexes
userBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });
userBadgeSchema.index({ user: 1, currentTier: 1 });
userBadgeSchema.index({ user: 1, isCompleted: 1 });
userBadgeSchema.index({ badge: 1, currentTier: 1 });

// Method to update progress
userBadgeSchema.methods.updateProgress = async function (
  count: number,
  amount?: number
): Promise<boolean> {
  this.progressCount += count;
  if (amount !== undefined) {
    this.progressAmount = (this.progressAmount || 0) + amount;
  }
  this.lastUpdatedAt = new Date();

  await this.save();

  // Check if tier upgrade is needed
  return this.checkTierUpgrade();
};

// Method to unlock next tier
userBadgeSchema.methods.unlockNextTier = async function (): Promise<void> {
  const currentIndex = TIER_ORDER.indexOf(this.currentTier);
  if (currentIndex === -1 || currentIndex === TIER_ORDER.length - 1) {
    // Already at max tier
    this.isCompleted = true;
    this.completedAt = new Date();
  } else {
    // Upgrade to next tier
    const nextTier = TIER_ORDER[currentIndex + 1];
    this.currentTier = nextTier;

    // Add to unlock history
    this.tiersUnlocked.push({
      tier: nextTier as any,
      unlockedAt: new Date(),
    });

    // Check if completed (reached gold)
    if (nextTier === 'gold') {
      this.isCompleted = true;
      this.completedAt = new Date();
    }
  }

  await this.save();
};

// Method to check if tier upgrade is needed
userBadgeSchema.methods.checkTierUpgrade = async function (): Promise<boolean> {
  // Populate badge to get tier requirements
  await this.populate('badge');

  const badge = this.badge as any;
  if (!badge || !badge.tiers) {
    return false;
  }

  // Find current tier index
  const currentIndex = TIER_ORDER.indexOf(this.currentTier);
  if (currentIndex === TIER_ORDER.length - 1) {
    // Already at max tier
    return false;
  }

  // Check if progress meets next tier requirement
  const nextTier = TIER_ORDER[currentIndex + 1];
  const nextTierData = badge.tiers.find((t: IBadgeTier) => t.tier === nextTier);

  if (!nextTierData) {
    return false;
  }

  let meetsRequirement = false;

  // Check count requirement
  if (this.progressCount >= nextTierData.requiredCount) {
    meetsRequirement = true;
  }

  // Check amount requirement (if applicable)
  if (nextTierData.requiredAmount && this.progressAmount !== undefined) {
    meetsRequirement =
      meetsRequirement && this.progressAmount >= nextTierData.requiredAmount;
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
