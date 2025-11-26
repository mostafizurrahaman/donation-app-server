// src/app/modules/Reward/reward.interface.ts
import { Document, Types } from 'mongoose';

export interface IRewardCode {
  code: string;
  isUsed: boolean;
  usedBy?: Types.ObjectId;
  usedAt?: Date;
}

export interface IReward {
  business: Types.ObjectId;
  title: string;
  description: string;
  image?: string;

  // Reward Type
  type: 'in-store' | 'online';
  category: string;

  // Points & Availability
  pointsCost: number;
  redemptionLimit: number;
  redeemedCount: number;
  remainingCount: number;

  // Dates
  startDate: Date;
  expiryDate?: Date;

  // Status
  status: 'active' | 'inactive' | 'expired' | 'upcoming' | 'sold-out';
  isActive: boolean;

  // Online Reward Specific
  codes?: IRewardCode[];
  giftCardUrl?: string;

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

export interface IRewardModel extends IReward, Document {
  incrementViews(): Promise<void>;
  incrementRedemptions(): Promise<void>;
  decrementStock(): Promise<boolean>;
  getAvailableCode(): Promise<IRewardCode | null>;
  markCodeAsUsed(code: string, userId: Types.ObjectId): Promise<void>;
  checkAvailability(): boolean;
  updateStatus(): Promise<void>;
}

export interface ICreateRewardPayload {
  businessId: Types.ObjectId | string;
  title: string;
  description: string;
  image?: string;
  type: 'in-store' | 'online';
  category: string;
  pointsCost: number;
  redemptionLimit: number;
  startDate: Date;
  expiryDate?: Date;
  codes?: string[];
  giftCardUrl?: string;
  terms?: string;
  featured?: boolean;
}

export interface IUpdateRewardPayload {
  title?: string;
  description?: string;
  image?: string;
  category?: string;
  pointsCost?: number;
  redemptionLimit?: number;
  startDate?: Date;
  expiryDate?: Date;
  codes?: string[];
  giftCardUrl?: string;
  terms?: string;
  featured?: boolean;
  isActive?: boolean;
}

export interface IRewardFilterQuery {
  businessId?: Types.ObjectId | string;
  type?: 'in-store' | 'online';
  category?: string;
  status?: string;
  minPoints?: number;
  maxPoints?: number;
  featured?: boolean;
  userId?: Types.ObjectId | string; // For checking affordability
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

export interface IBusinessInfo {
  _id: Types.ObjectId;
  name: string;
  category?: string;
  coverImage?: string;
  locations?: string[];
  businessEmail?: string;
  businessPhoneNumber?: string;
}

export interface IRewardWithBusiness extends IReward {
  business: IBusinessInfo;
}

export interface IRewardResponse {
  rewards: Array<
    IRewardWithBusiness & {
      isAvailable: boolean;
      userCanAfford?: boolean;
    }
  >;
  total: number;
  page: number;
  limit: number;
  meta?: {
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
