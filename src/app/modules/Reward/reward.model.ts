// src/app/modules/Reward/reward.model.ts
import { Schema, model, Types } from 'mongoose';
import { IReward, IRewardModel, IRewardCode } from './reward.interface';
import {
  REWARD_TYPE_VALUES,
  REWARD_STATUS_VALUES,
  REWARD_CATEGORY_VALUES,
  MIN_POINTS_COST,
  MAX_POINTS_COST,
  MIN_REDEMPTION_LIMIT,
  MAX_REDEMPTION_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TERMS_LENGTH,
  MAX_CODE_LENGTH,
  MAX_CODES_PER_REWARD,
} from './reward.constant';

// Reward Code Sub-Schema
const rewardCodeSchema = new Schema<IRewardCode>(
  {
    code: {
      type: String,
      required: true,
      maxlength: MAX_CODE_LENGTH,
      trim: true,
      uppercase: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
    },
    usedAt: {
      type: Date,
    },
  },
  { _id: false }
);

// Main Reward Schema
const rewardSchema = new Schema<IReward, IRewardModel>(
  {
    business: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      maxlength: [
        MAX_TITLE_LENGTH,
        `Title cannot exceed ${MAX_TITLE_LENGTH} characters`,
      ],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [
        MAX_DESCRIPTION_LENGTH,
        `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      ],
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },

    // Reward Type
    type: {
      type: String,
      enum: {
        values: REWARD_TYPE_VALUES,
        message: 'Invalid reward type: {VALUE}',
      },
      required: [true, 'Reward type is required'],
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: REWARD_CATEGORY_VALUES,
        message: 'Invalid category: {VALUE}',
      },
      required: [true, 'Category is required'],
      index: true,
    },

    // Points & Availability
    pointsCost: {
      type: Number,
      required: [true, 'Points cost is required'],
      min: [MIN_POINTS_COST, `Points cost must be at least ${MIN_POINTS_COST}`],
      max: [MAX_POINTS_COST, `Points cost cannot exceed ${MAX_POINTS_COST}`],
      index: true,
    },
    redemptionLimit: {
      type: Number,
      required: [true, 'Redemption limit is required'],
      min: [
        MIN_REDEMPTION_LIMIT,
        `Redemption limit must be at least ${MIN_REDEMPTION_LIMIT}`,
      ],
      max: [
        MAX_REDEMPTION_LIMIT,
        `Redemption limit cannot exceed ${MAX_REDEMPTION_LIMIT}`,
      ],
    },
    redeemedCount: {
      type: Number,
      default: 0,
      min: [0, 'Redeemed count cannot be negative'],
    },
    remainingCount: {
      type: Number,
      required: true,
      min: [0, 'Remaining count cannot be negative'],
    },

    // Dates
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      index: true,
    },
    expiryDate: {
      type: Date,
      index: true,
      validate: {
        validator: function (this: IReward, value: Date) {
          return !value || value > this.startDate;
        },
        message: 'Expiry date must be after start date',
      },
    },

    // Status
    status: {
      type: String,
      enum: {
        values: REWARD_STATUS_VALUES,
        message: 'Invalid status: {VALUE}',
      },
      default: 'upcoming',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Online Reward Specific
    codes: {
      type: [rewardCodeSchema],
      default: [],
      validate: {
        validator: function (codes: IRewardCode[]) {
          return codes.length <= MAX_CODES_PER_REWARD;
        },
        message: `Cannot have more than ${MAX_CODES_PER_REWARD} codes`,
      },
    },
    giftCardUrl: {
      type: String,
      trim: true,
    },

    // Terms & Conditions
    terms: {
      type: String,
      maxlength: [
        MAX_TERMS_LENGTH,
        `Terms cannot exceed ${MAX_TERMS_LENGTH} characters`,
      ],
      trim: true,
    },

    // Metadata
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: Number,
      default: 1,
      min: [1, 'Priority must be at least 1'],
      max: [10, 'Priority cannot exceed 10'],
    },

    // Statistics
    views: {
      type: Number,
      default: 0,
      min: [0, 'Views cannot be negative'],
    },
    redemptions: {
      type: Number,
      default: 0,
      min: [0, 'Redemptions cannot be negative'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for optimal performance
rewardSchema.index({ business: 1, status: 1 });
rewardSchema.index({ business: 1, isActive: 1 });
rewardSchema.index({ type: 1, category: 1 });
rewardSchema.index({ pointsCost: 1 });
rewardSchema.index({ featured: 1, priority: -1 });
rewardSchema.index({ expiryDate: 1 });
rewardSchema.index({ title: 'text', description: 'text' });
rewardSchema.index({ 'codes.code': 1 });
rewardSchema.index({ 'codes.isUsed': 1 });

// Virtual for checking if reward is available
rewardSchema.virtual('isAvailable').get(function (this: IReward) {
  return this.checkAvailability();
});

// Method to increment views
rewardSchema.methods.incrementViews = async function (
  this: IRewardModel
): Promise<void> {
  this.views += 1;
  await this.save();
};

// Method to increment redemptions
rewardSchema.methods.incrementRedemptions = async function (
  this: IRewardModel
): Promise<void> {
  this.redemptions += 1;
  this.redeemedCount += 1;
  this.remainingCount = Math.max(0, this.remainingCount - 1);

  // Update status if sold out
  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
};

// Method to decrement stock
rewardSchema.methods.decrementStock = async function (
  this: IRewardModel
): Promise<boolean> {
  if (this.remainingCount <= 0) {
    return false;
  }

  this.redeemedCount += 1;
  this.remainingCount = Math.max(0, this.remainingCount - 1);

  // Update status if sold out
  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
  return true;
};

// Method to get available code
rewardSchema.methods.getAvailableCode = async function (
  this: IRewardModel
): Promise<IRewardCode | null> {
  if (this.type !== 'online' || !this.codes || this.codes.length === 0) {
    return null;
  }

  const availableCode = this.codes.find((code: IRewardCode) => !code.isUsed);
  return availableCode || null;
};

// Method to mark code as used
rewardSchema.methods.markCodeAsUsed = async function (
  this: IRewardModel,
  code: string,
  userId: Types.ObjectId
): Promise<void> {
  const codeIndex =
    this.codes?.findIndex(
      (c: IRewardCode) =>
        c.code.toUpperCase() === code.toUpperCase() && !c.isUsed
    ) ?? -1;

  if (codeIndex === -1) {
    throw new Error('Code not found or already used');
  }

  if (this.codes) {
    this.codes[codeIndex].isUsed = true;
    this.codes[codeIndex].usedBy = userId;
    this.codes[codeIndex].usedAt = new Date();
  }

  await this.save();
};

// Method to check availability
rewardSchema.methods.checkAvailability = function (this: IReward): boolean {
  const now = new Date();

  // Check if active
  if (!this.isActive) {
    return false;
  }

  // Check if started
  if (this.startDate > now) {
    return false;
  }

  // Check if expired
  if (this.expiryDate && this.expiryDate < now) {
    return false;
  }

  // Check if sold out
  if (this.remainingCount <= 0) {
    return false;
  }

  // For online rewards, check if codes available
  if (this.type === 'online' && this.codes && this.codes.length > 0) {
    const availableCode = this.codes.find((code: IRewardCode) => !code.isUsed);
    if (!availableCode) {
      return false;
    }
  }

  return true;
};

// Method to update status based on dates and stock
rewardSchema.methods.updateStatus = async function (
  this: IRewardModel
): Promise<void> {
  const now = new Date();

  if (!this.isActive) {
    this.status = 'inactive';
  } else if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  } else if (this.expiryDate && this.expiryDate < now) {
    this.status = 'expired';
  } else if (this.startDate > now) {
    this.status = 'upcoming';
  } else {
    this.status = 'active';
  }

  await this.save();
};

// Pre-save hook to calculate remaining count and update status
rewardSchema.pre('save', function (next) {
  // Initialize remainingCount on creation
  if (this.isNew) {
    this.remainingCount = this.redemptionLimit - this.redeemedCount;
  }

  // Auto-update status
  const now = new Date();
  if (!this.isActive) {
    this.status = 'inactive';
  } else if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  } else if (this.expiryDate && this.expiryDate < now) {
    this.status = 'expired';
  } else if (this.startDate > now) {
    this.status = 'upcoming';
  } else {
    this.status = 'active';
  }

  next();
});

// Static method to find available rewards
rewardSchema.statics.findAvailable = function (
  filter: Record<string, unknown> = {}
) {
  const now = new Date();
  return this.find({
    ...filter,
    isActive: true,
    status: 'active',
    startDate: { $lte: now },
    $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }],
    remainingCount: { $gt: 0 },
  });
};

// Static method to find featured rewards
rewardSchema.statics.findFeatured = function (limit = 10) {
  return this.findAvailable({ featured: true })
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

export const Reward = model<IReward, IRewardModel>('Reward', rewardSchema);
export default Reward;
