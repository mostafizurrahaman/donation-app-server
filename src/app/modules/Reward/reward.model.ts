// src/app/modules/Reward/reward.model.ts

import { Schema, model, Types } from 'mongoose';
import {
  IReward,
  IRewardDocument,
  IRewardModel,
  IRewardCode,
  ILimitUpdateRecord,
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

// Limit Update History Sub-Schema
const limitUpdateRecordSchema = new Schema<ILimitUpdateRecord>(
  {
    previousLimit: { type: Number, required: true },
    newLimit: { type: Number, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
    changedAt: { type: Date, required: true },
    reason: { type: String, maxlength: 500 },
  },
  { _id: false }
);

// Reward Code Sub-Schema
const rewardCodeSchema = new Schema<IRewardCode>(
  {
    code: {
      type: String,
      required: true,
      maxlength: MAX_CODE_LENGTH,
      trim: true,
    },
    isGiftCard: { type: Boolean, default: false },
    isDiscountCode: { type: Boolean, default: false },
    isUsed: { type: Boolean, default: false, index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Client' },
    usedAt: { type: Date },
    redemptionId: { type: Schema.Types.ObjectId, ref: 'RewardRedemption' },
    redemptionMethod: {
      type: String,
      enum: [...REDEMPTION_METHOD_VALUES, undefined],
    },
  },
  { _id: false }
);

// In-Store Redemption Methods Sub-Schema
const inStoreRedemptionMethodsSchema = new Schema(
  {
    qrCode: { type: Boolean, default: false },
    staticCode: { type: Boolean, default: false },
    nfcTap: { type: Boolean, default: false },
  },
  { _id: false }
);

// Online Redemption Methods Sub-Schema
const onlineRedemptionMethodsSchema = new Schema(
  {
    discountCode: { type: Boolean, default: false },
    giftCard: { type: Boolean, default: false },
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
    image: { type: String, trim: true },

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

    pointsCost: {
      type: Number,
      default: STATIC_POINTS_COST,
      immutable: true,
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

    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      default: Date.now,
      index: true,
    },
    expiryDate: { type: Date, index: true },

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

    inStoreRedemptionMethods: {
      type: inStoreRedemptionMethodsSchema,
    },

    onlineRedemptionMethods: {
      type: onlineRedemptionMethodsSchema,
    },

    codes: {
      type: [rewardCodeSchema],
      default: [],
    },

    terms: {
      type: String,
      maxlength: [
        MAX_TERMS_LENGTH,
        `Terms cannot exceed ${MAX_TERMS_LENGTH} characters`,
      ],
      trim: true,
    },

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

    lastLimitUpdate: { type: Date },
    limitUpdateHistory: {
      type: [limitUpdateRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
rewardSchema.index({ business: 1, status: 1 });
rewardSchema.index({ business: 1, isActive: 1 });
rewardSchema.index({ business: 1, title: 1 }, { unique: true });
rewardSchema.index({ type: 1, category: 1 });
rewardSchema.index({ featured: 1, priority: -1 });
rewardSchema.index({ 'codes.code': 1 });
rewardSchema.index({ title: 'text', description: 'text' });

// Instance Methods
rewardSchema.methods.incrementViews = async function (): Promise<void> {
  this.views += 1;
  await this.save();
};

rewardSchema.methods.incrementRedemptions = async function (): Promise<void> {
  this.redemptions += 1;
  this.redeemedCount += 1;
  this.remainingCount = Math.max(0, this.remainingCount - 1);

  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
};

rewardSchema.methods.decrementStock = async function (): Promise<boolean> {
  if (this.remainingCount <= 0) return false;

  this.redeemedCount += 1;
  this.remainingCount -= 1;

  if (this.remainingCount <= 0) {
    this.status = 'sold-out';
  }

  await this.save();
  return true;
};

rewardSchema.methods.getAvailableCode = function (
  type?: 'discount' | 'giftcard'
): IRewardCode | null {
  if (this.codes.length === 0) return null;

  if (type) {
    const filterKey = type === 'giftcard' ? 'isGiftCard' : 'isDiscountCode';
    return (
      this.codes.find((code: IRewardCode) => !code.isUsed && code[filterKey]) ||
      null
    );
  }

  return this.codes.find((code: IRewardCode) => !code.isUsed) || null;
};

rewardSchema.methods.markCodeAsUsed = async function (
  code: string,
  userId: Types.ObjectId,
  redemptionId: Types.ObjectId
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
  this.codes[codeIndex].redemptionId = redemptionId;

  await this.save();
};

rewardSchema.methods.returnCode = async function (code: string): Promise<void> {
  const codeIndex = this.codes.findIndex(
    (c: IRewardCode) => c.code === code && c.isUsed
  );

  if (codeIndex === -1) return;

  this.codes[codeIndex].isUsed = false;
  this.codes[codeIndex].usedBy = undefined;
  this.codes[codeIndex].usedAt = undefined;
  this.codes[codeIndex].redemptionId = undefined;

  await this.save();
};

rewardSchema.methods.checkAvailability = function (): boolean {
  const now = new Date();

  if (!this.isActive) return false;
  if (this.startDate > now) return false;
  if (this.expiryDate && this.expiryDate < now) return false;
  if (this.remainingCount <= 0) return false;

  if (this.type === 'online' && this.codes.length > 0) {
    const availableCode = this.codes.find((code: IRewardCode) => !code.isUsed);
    if (!availableCode) return false;
  }

  return true;
};

// Check if a business can validate this reward (only creator business can validate)
rewardSchema.methods.isCreatorBusiness = function (businessId: Types.ObjectId): boolean {
  return this.business.toString() === businessId.toString();
};

rewardSchema.methods.canUpdateLimit = function (newLimit: number): boolean {
  return newLimit >= this.redeemedCount;
};

rewardSchema.methods.updateStatus = async function (): Promise<void> {
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

// Pre-save hooks
rewardSchema.pre('save', function (next) {
  if (this.isNew) {
    this.remainingCount = this.redemptionLimit - this.redeemedCount;
  }

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

// Validation hook
rewardSchema.pre('save', function (next) {
  if (this.type === 'in-store') {
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
    this.onlineRedemptionMethods = undefined;
  } else if (this.type === 'online') {
    if (
      !this.onlineRedemptionMethods ||
      (!this.onlineRedemptionMethods.discountCode &&
        !this.onlineRedemptionMethods.giftCard)
    ) {
      return next(
        new Error('At least one online redemption method must be selected')
      );
    }
    this.inStoreRedemptionMethods = undefined;
  }

  next();
});

// Static methods
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

rewardSchema.statics.checkCodeUniqueness = async function (
  codes: string[],
  excludeRewardId?: Types.ObjectId
): Promise<boolean> {
  const query: Record<string, unknown> = {
    'codes.code': { $in: codes },
  };

  if (excludeRewardId) {
    query._id = { $ne: excludeRewardId };
  }

  const duplicates = await this.findOne(query);
  return !duplicates;
};

export const Reward = model<IRewardDocument, IRewardModel>(
  'Reward',
  rewardSchema
);
