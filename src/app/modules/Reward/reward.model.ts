// src/app/modules/Reward/reward.model.ts
import { Schema, model } from 'mongoose';
import {
  IReward,
  IRewardDocument,
  IRewardModel,
  IRewardCode,
} from './reward.interface';
import {
  REWARD_TYPE_VALUES,
  REWARD_STATUS_VALUES,
  REWARD_CATEGORY_VALUES,
  STATIC_POINTS_COST,
  MIN_REDEMPTION_LIMIT,
  MAX_REDEMPTION_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TERMS_LENGTH,
  MAX_CODE_LENGTH,
  REDEMPTION_METHOD_VALUES,
} from './reward.constant';
import { Types } from 'mongoose';

// Reward Code Sub-Schema
const rewardCodeSchema = new Schema<IRewardCode>(
  {
    code: {
      type: String,
      required: true,
      maxlength: MAX_CODE_LENGTH,
      trim: true,
    },
    isGiftCard: {
      type: Boolean,
      default: false,
    },
    isDiscountCode: {
      type: Boolean,
      default: false,
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
    redemptionMethod: {
      type: String,
      enum: REDEMPTION_METHOD_VALUES,
    },
  },
  { _id: false }
);

// In-Store Redemption Methods Sub-Schema
const inStoreRedemptionMethodsSchema = new Schema(
  {
    qrCode: {
      type: Boolean,
      default: false,
    },
    staticCode: {
      type: Boolean,
      default: false,
    },
    nfcTap: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

// Online Redemption Methods Sub-Schema
const onlineRedemptionMethodsSchema = new Schema(
  {
    discountCode: {
      type: Boolean,
      default: false,
    },
    giftCard: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

// Main Reward Schema
const rewardSchema = new Schema<IRewardDocument, IRewardModel>(
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
      enum: REWARD_TYPE_VALUES,
      required: [true, 'Reward type is required'],
      index: true,
    },
    category: {
      type: String,
      enum: REWARD_CATEGORY_VALUES,
      required: [true, 'Category is required'],
      index: true,
    },

    // Points & Availability (Static 500 points)
    pointsCost: {
      type: Number,
      default: STATIC_POINTS_COST,
      immutable: true, // Cannot be changed
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
      default: Date.now,
      index: true,
    },
    expiryDate: {
      type: Date,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: REWARD_STATUS_VALUES,
      default: 'active',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // In-Store Redemption Methods
    inStoreRedemptionMethods: {
      type: inStoreRedemptionMethodsSchema,
      required: function (this: IReward) {
        return this.type === 'in-store';
      },
    },

    // Online Redemption Methods
    onlineRedemptionMethods: {
      type: onlineRedemptionMethodsSchema,
      required: function (this: IReward) {
        return this.type === 'online';
      },
    },

    // Codes
    codes: {
      type: [rewardCodeSchema],
      default: [],
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
rewardSchema.index({ 'codes.isUsed': 1 });
rewardSchema.index({ 'codes.code': 1, business: 1 }); // Unique per reward

// Virtual for checking if reward is available
rewardSchema.virtual('isAvailable').get(function (this: IRewardDocument) {
  return this.checkAvailability();
});

// Method to increment views
rewardSchema.methods.incrementViews = async function (
  this: IRewardDocument
): Promise<void> {
  this.views += 1;
  await this.save();
};

// Method to increment redemptions
rewardSchema.methods.incrementRedemptions = async function (
  this: IRewardDocument
): Promise<void> {
  this.redemptions += 1;
  this.redeemedCount += 1;
  this.remainingCount -= 1;

  // Update status if sold out
  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
};

// Method to decrement stock
rewardSchema.methods.decrementStock = async function (
  this: IRewardDocument
): Promise<boolean> {
  if (this.remainingCount <= 0) {
    return false;
  }

  this.redeemedCount += 1;
  this.remainingCount -= 1;

  // Update status if sold out
  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
  return true;
};

// Method to get available code by type
rewardSchema.methods.getAvailableCode = async function (
  this: IRewardDocument,
  type: 'discount' | 'giftcard'
): Promise<IRewardCode | null> {
  if (this.type !== 'online' || !this.codes || this.codes.length === 0) {
    return null;
  }

  const filterKey = type === 'giftcard' ? 'isGiftCard' : 'isDiscountCode';
  const availableCode = this.codes.find(
    (code: IRewardCode) => !code.isUsed && code[filterKey]
  );

  return availableCode || null;
};

// Method to mark code as used
rewardSchema.methods.markCodeAsUsed = async function (
  this: IRewardDocument,
  code: string,
  userId: Types.ObjectId,
  redemptionMethod: string
): Promise<void> {
  const codeIndex = this.codes.findIndex(
    (c: IRewardCode) => c.code === code && !c.isUsed
  );

  if (codeIndex === -1) {
    throw new Error('Code not found or already used');
  }

  this.codes[codeIndex].isUsed = true;
  this.codes[codeIndex].usedBy = userId;
  this.codes[codeIndex].usedAt = new Date();
  this.codes[codeIndex].redemptionMethod = redemptionMethod;

  await this.save();
};

// Method to check availability
rewardSchema.methods.checkAvailability = function (
  this: IRewardDocument
): boolean {
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
  if (this.type === 'online' && this.codes.length > 0) {
    const availableCode = this.codes.find((code: IRewardCode) => !code.isUsed);
    if (!availableCode) {
      return false;
    }
  }

  return true;
};

// Method to update status based on dates and stock
rewardSchema.methods.updateStatus = async function (
  this: IRewardDocument
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

// Pre-save hook to calculate remaining count and set priority
rewardSchema.pre('save', function (next) {
  // Initialize remainingCount on creation
  if (this.isNew) {
    this.remainingCount = this.redemptionLimit - this.redeemedCount;
  }

  // Auto-update priority if featured
  if (this.featured) {
    this.priority = 10;
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
  } else if (this.status !== 'active') {
    this.status = 'active';
  }

  next();
});

// Validation: Ensure redemption methods match reward type
rewardSchema.pre('save', function (next) {
  if (this.type === 'in-store') {
    // Must have at least one in-store redemption method
    if (
      !this.inStoreRedemptionMethods ||
      (!this.inStoreRedemptionMethods.qrCode &&
        !this.inStoreRedemptionMethods.staticCode &&
        !this.inStoreRedemptionMethods.nfcTap)
    ) {
      return next(
        new Error('At least one in-store redemption method must be selected')
      );
    }
    // Clear online methods
    this.onlineRedemptionMethods = undefined;
  } else if (this.type === 'online') {
    // Must have at least one online redemption method
    if (
      !this.onlineRedemptionMethods ||
      (!this.onlineRedemptionMethods.discountCode &&
        !this.onlineRedemptionMethods.giftCard)
    ) {
      return next(
        new Error('At least one online redemption method must be selected')
      );
    }
    // Clear in-store methods
    this.inStoreRedemptionMethods = undefined;
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
    startDate: { $lte: now },
    $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }],
    remainingCount: { $gt: 0 },
  });
};

export const Reward = model<IRewardDocument, IRewardModel>(
  'Reward',
  rewardSchema
);
