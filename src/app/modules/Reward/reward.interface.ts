// src/app/modules/Reward/reward.interface.ts

import { Document, Model, Types } from 'mongoose';

// Reward Code Interface
export interface IRewardCode {
  code: string;
  isGiftCard: boolean;
  isDiscountCode: boolean;
  isUsed: boolean;
  usedBy?: Types.ObjectId;
  usedAt?: Date;
  redemptionId?: Types.ObjectId;
  redemptionMethod?: string;
}

// Limit Update History Record
export interface ILimitUpdateRecord {
  previousLimit: number;
  newLimit: number;
  changedBy: Types.ObjectId;
  changedAt: Date;
  reason?: string;
}

// Main Reward Interface
export interface IReward {
  business: Types.ObjectId;
  title: string;
  description: string;
  image?: string;

  type: 'in-store' | 'online';
  category: string;

  pointsCost: number;
  redemptionLimit: number;
  redeemedCount: number;
  remainingCount: number;

  startDate: Date;
  expiryDate?: Date;

  status: 'active' | 'inactive' | 'expired' | 'upcoming' | 'sold-out';
  isActive: boolean;

  inStoreRedemptionMethods?: {
    qrCode: boolean;
    staticCode: boolean;
    nfcTap: boolean;
  };

  onlineRedemptionMethods?: {
    discountCode: boolean;
    giftCard: boolean;
  };

  codes: IRewardCode[];
  terms?: string;

  featured: boolean;
  priority: number;

  views: number;
  redemptions: number;

  lastLimitUpdate?: Date;
  limitUpdateHistory?: ILimitUpdateRecord[];

  createdAt: Date;
  updatedAt: Date;
}

// Reward Redemption Interface
export interface IRewardRedemption {
  user: Types.ObjectId;
  reward: Types.ObjectId;
  business: Types.ObjectId;

  pointsSpent: number;
  pointsTransactionId?: Types.ObjectId;

  status: 'claimed' | 'redeemed' | 'expired' | 'cancelled';

  claimedAt: Date;
  redeemedAt?: Date;
  expiredAt?: Date;
  cancelledAt?: Date;

  assignedCode?: string;
  redemptionMethod?: string;

  qrCode?: string;
  qrCodeUrl?: string;

  expiresAt: Date;

  redeemedByStaff?: Types.ObjectId;
  redemptionLocation?: string;
  redemptionNotes?: string;

  cancellationReason?: string;
  refundTransactionId?: Types.ObjectId;

  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Document Interfaces
export interface IRewardDocument extends IReward, Document {
  _id: Types.ObjectId;
  incrementViews(): Promise<void>;
  incrementRedemptions(): Promise<void>;
  decrementStock(): Promise<boolean>;
  getAvailableCode(type?: 'discount' | 'giftcard'): IRewardCode | null;
  markCodeAsUsed(
    code: string,
    userId: Types.ObjectId,
    redemptionId: Types.ObjectId
  ): Promise<void>;
  returnCode(code: string): Promise<void>;
  checkAvailability(): boolean;
  updateStatus(): Promise<void>;
  canUpdateLimit(newLimit: number): boolean;
  isCreatorBusiness(businessId: Types.ObjectId): boolean;
}

export interface IRewardRedemptionDocument extends IRewardRedemption, Document {
  _id: Types.ObjectId;
  markAsRedeemed(staffId?: Types.ObjectId, notes?: string): Promise<void>;
  cancel(reason?: string): Promise<void>;
  checkExpiry(): Promise<void>;
  generateQRCode(): Promise<string>;
}

// Model Interfaces
export interface IRewardModel extends Model<IRewardDocument> {
  findAvailable(filter?: Record<string, unknown>): Promise<IRewardDocument[]>;
  checkCodeUniqueness(
    codes: string[],
    excludeRewardId?: Types.ObjectId
  ): Promise<boolean>;
}

export interface IRewardRedemptionModel
  extends Model<IRewardRedemptionDocument> {
  findClaimedByUser(
    userId: Types.ObjectId
  ): Promise<IRewardRedemptionDocument[]>;
  expireOldClaims(): Promise<number>;
}

// Payload Interfaces
export interface ICreateRewardPayload {
  businessId: Types.ObjectId | string;
  title: string;
  description: string;
  image?: string;
  type: 'in-store' | 'online';
  category: string;
  redemptionLimit: number;
  startDate?: Date;
  expiryDate?: Date;
  inStoreRedemptionMethods?: {
    qrCode: boolean;
    staticCode: boolean;
    nfcTap: boolean;
  };
  onlineRedemptionMethods?: {
    discountCode: boolean;
    giftCard: boolean;
  };
  terms?: string;
  featured?: boolean;
}

export interface IUpdateRewardPayload {
  title?: string;
  description?: string;
  image?: string;
  category?: string;
  redemptionLimit?: number;
  startDate?: Date;
  expiryDate?: Date;
  inStoreRedemptionMethods?: {
    qrCode?: boolean;
    staticCode?: boolean;
    nfcTap?: boolean;
  };
  onlineRedemptionMethods?: {
    discountCode?: boolean;
    giftCard?: boolean;
  };
  terms?: string;
  featured?: boolean;
  isActive?: boolean;
  updateReason?: string;
}

export interface IClaimRewardPayload {
  rewardId: string;
  userId: string;
}

export interface IRedeemRewardPayload {
  redemptionId: string;
  staffId?: string;
  location?: string;
  notes?: string;
}

export interface ICancelClaimPayload {
  redemptionId: string;
  userId: string;
  reason?: string;
}

export interface IUploadCodesPayload {
  rewardId: string;
  codes: IParsedCodeFromCSV[];
}

export interface IParsedCodeFromCSV {
  code: string;
  isGiftCard: boolean;
  isDiscountCode: boolean;
}

// Filter & Query Interfaces
export interface IRewardFilterQuery {
  businessId?: Types.ObjectId | string;
  type?: 'in-store' | 'online';
  category?: string;
  status?: string;
  featured?: boolean;
  userId?: Types.ObjectId | string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IRedemptionFilterQuery {
  userId?: string;
  businessId?: string;
  status?: string;
  includeExpired?: boolean;
  page?: number;
  limit?: number;
}

// Response Interfaces
export interface IRewardAvailability {
  isAvailable: boolean;
  reason?: string;
  remainingCount: number;
  userCanAfford: boolean;
  userBalance?: number;
  hasAlreadyClaimed?: boolean;
  existingClaimId?: Types.ObjectId;
}

export interface IClaimResult {
  redemption: IRewardRedemptionDocument;
  message: string;
  isRetry?: boolean;
  code?: string;
  availableMethods?: string[];
}

export interface IRewardsListResult {
  rewards: Array<
    IReward & {
      isAvailable: boolean;
      userCanAfford?: boolean;
      claimStatus?: string;
    }
  >;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IRewardStatistics {
  totalRewards: number;
  activeRewards: number;
  expiredRewards: number;
  soldOutRewards: number;
  totalRedemptions: number;
  totalViews: number;
  averageRedemptionRate: number;
  topRewards: Array<{
    reward: Types.ObjectId;
    title: string;
    redemptions: number;
  }>;
  rewardsByCategory: Array<{
    category: string;
    count: number;
  }>;
  rewardsByType: {
    inStore: number;
    online: number;
  };
}

// Populated Types
export interface IRewardPopulated extends Omit<IRewardDocument, 'business'> {
  business: {
    _id: Types.ObjectId;
    name: string;
    category?: string;
    coverImage?: string;
    locations?: string[];
    businessEmail?: string;
    businessPhoneNumber?: string;
  };
}

export interface IRedemptionPopulated
  extends Omit<IRewardRedemptionDocument, 'reward' | 'business' | 'user'> {
  reward: {
    _id: Types.ObjectId;
    title: string;
    description: string;
    image?: string;
    type: string;
    category: string;
    pointsCost: number;
    terms?: string;
  };
  business: {
    _id: Types.ObjectId;
    name: string;
    locations?: string[];
  };
  user: {
    _id: Types.ObjectId;
    name: string;
    image?: string;
  };
}
