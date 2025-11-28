// src/app/modules/Reward/reward.interface.ts
import { Document, Model, Types } from 'mongoose';

export interface IReward {
  business: Types.ObjectId;
  title: string;
  description: string;
  image?: string;

  // Reward Type (Only one type allowed at a time)
  type: 'in-store' | 'online';
  category: string; // Required

  // Points & Availability (Static 500 points)
  pointsCost: number; // Always 500
  redemptionLimit: number;
  redeemedCount: number;
  remainingCount: number;

  // Dates
  startDate: Date; // Defaults to now
  expiryDate?: Date;

  // Status
  status: 'active' | 'inactive' | 'expired' | 'upcoming' | 'sold-out';
  isActive: boolean;

  // In-Store Specific (When type = 'in-store')
  inStoreRedemptionMethods?: {
    qrCode: boolean;
    staticCode: boolean;
    nfcTap: boolean;
  };

  // Online Specific (When type = 'online')
  onlineRedemptionMethods?: {
    discountCode: boolean;
    giftCard: boolean;
  };

  // Codes (for both in-store and online)
  codes: IRewardCode[];

  // Terms & Conditions
  terms?: string;

  // Metadata
  featured: boolean;
  priority: number;

  // Statistics
  views: number;
  redemptions: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IRewardCode {
  code: string; // Can be URL (gift card) or text code (discount code)
  isGiftCard: boolean; // true = gift card URL, false = discount code
  isDiscountCode: boolean; // true = discount code, false = gift card
  isUsed: boolean;
  usedBy?: Types.ObjectId;
  usedAt?: Date;
  redemptionMethod?: string; // Track which method was used
}

// Document interface for instance methods
export interface IRewardDocument extends IReward, Document {
  incrementViews(): Promise<void>;
  incrementRedemptions(): Promise<void>;
  decrementStock(): Promise<boolean>;
  getAvailableCode(type: 'discount' | 'giftcard'): Promise<IRewardCode | null>;
  markCodeAsUsed(
    code: string,
    userId: Types.ObjectId,
    redemptionMethod: string
  ): Promise<void>;
  checkAvailability(): boolean;
  updateStatus(): Promise<void>;
}

// Model interface for static methods
export interface IRewardModel extends Model<IRewardDocument> {
  findAvailable(filter?: Record<string, unknown>): Promise<IRewardDocument[]>;
}

export interface ICreateRewardPayload {
  businessId: Types.ObjectId | string;
  title: string;
  description: string;
  image?: string;
  type: 'in-store' | 'online';
  category: string; // Required
  redemptionLimit?: number; // Made optional for online rewards with codes
  startDate?: Date; // Defaults to new Date()
  expiryDate?: Date;

  // In-Store redemption methods (only when type = 'in-store')
  inStoreRedemptionMethods?: {
    qrCode: boolean;
    staticCode: boolean;
    nfcTap: boolean;
  };

  // Online redemption methods (only when type = 'online')
  onlineRedemptionMethods?: {
    discountCode: boolean;
    giftCard: boolean;
  };

  // For in-store: we'll auto-generate codes
  // For online: codes come from CSV upload

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
}

export interface IUploadCodesPayload {
  rewardId: string;
  codes: Array<{
    code: string; // URL or code text
    isGiftCard: boolean;
    isDiscountCode: boolean;
  }>;
}

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

export interface IRewardStatistics {
  totalRewards: number;
  activeRewards: number;
  expiredRewards: number;
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
}

export interface IRewardAvailability {
  isAvailable: boolean;
  reason?: string;
  remainingCount: number;
  userCanAfford: boolean;
  userBalance?: number;
}

export interface IParsedCodeFromCSV {
  code: string;
  isGiftCard: boolean;
  isDiscountCode: boolean;
}
