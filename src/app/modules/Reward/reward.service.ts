// src/app/modules/Reward/reward.service.ts
import { Types, ClientSession } from 'mongoose';
import { Reward } from './reward.model';
import { pointsService } from '../Points/points.service';
import {
  ICreateRewardPayload,
  IUpdateRewardPayload,
  IRewardFilterQuery,
  IRewardStatistics,
  IRewardAvailability,
  IRewardModel,
  IRewardResponse,
} from './reward.interface';
import { REWARD_MESSAGES, REWARD_STATUS } from './reward.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';

class RewardService {
  /**
   * Create a new reward
   */
  async createReward(
    payload: ICreateRewardPayload,
    businessId: string
  ): Promise<IRewardModel> {
    const session: ClientSession = await Reward.startSession();
    session.startTransaction();

    try {
      // Check for duplicate title within same business
      const existingReward = await Reward.findOne({
        business: new Types.ObjectId(businessId),
        title: payload.title,
      }).session(session);

      if (existingReward) {
        throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
      }

      // Prepare codes if provided
      const codes =
        payload.codes?.map((code) => ({
          code: code.trim().toUpperCase(),
          isUsed: false,
        })) || [];

      // Create reward
      const [reward] = await Reward.create(
        [
          {
            business: new Types.ObjectId(businessId),
            title: payload.title,
            description: payload.description,
            image: payload.image,
            type: payload.type,
            category: payload.category,
            pointsCost: payload.pointsCost,
            redemptionLimit: payload.redemptionLimit,
            redeemedCount: 0,
            remainingCount: payload.redemptionLimit,
            startDate: payload.startDate,
            expiryDate: payload.expiryDate,
            codes,
            giftCardUrl: payload.giftCardUrl,
            terms: payload.terms,
            featured: payload.featured || false,
            priority: payload.featured ? 10 : 1,
            isActive: true,
            views: 0,
            redemptions: 0,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      return await reward.populate('business', 'name category coverImage');
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Update a reward
   */
  async updateReward(
    rewardId: string,
    payload: IUpdateRewardPayload,
    businessId?: string
  ): Promise<IRewardModel> {
    const reward = await Reward.findById(rewardId);

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }

    // If businessId provided, verify ownership
    if (businessId && reward.business.toString() !== businessId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have permission to update this reward'
      );
    }

    // Update fields
    if (payload.title !== undefined) reward.title = payload.title;
    if (payload.description !== undefined)
      reward.description = payload.description;
    if (payload.image !== undefined) reward.image = payload.image;
    if (payload.category !== undefined) reward.category = payload.category;
    if (payload.pointsCost !== undefined)
      reward.pointsCost = payload.pointsCost;
    if (payload.redemptionLimit !== undefined) {
      // Adjust remaining count when limit changes
      const difference = payload.redemptionLimit - reward.redemptionLimit;
      reward.redemptionLimit = payload.redemptionLimit;
      reward.remainingCount = Math.max(0, reward.remainingCount + difference);
    }
    if (payload.startDate !== undefined) reward.startDate = payload.startDate;
    if (payload.expiryDate !== undefined)
      reward.expiryDate = payload.expiryDate;
    if (payload.giftCardUrl !== undefined)
      reward.giftCardUrl = payload.giftCardUrl;
    if (payload.terms !== undefined) reward.terms = payload.terms;
    if (payload.featured !== undefined) {
      reward.featured = payload.featured;
      reward.priority = payload.featured ? 10 : 1;
    }
    if (payload.isActive !== undefined) reward.isActive = payload.isActive;

    // Add new codes if provided
    if (payload.codes && payload.codes.length > 0) {
      const newCodes = payload.codes.map((code) => ({
        code: code.trim().toUpperCase(),
        isUsed: false,
        usedBy: undefined,
        usedAt: undefined,
      }));
      reward.codes = [...(reward.codes || []), ...newCodes];

      // Update remaining count based on new codes
      const unusedCodesCount = reward.codes.filter((c) => !c.isUsed).length;
      reward.remainingCount = Math.min(
        unusedCodesCount,
        reward.redemptionLimit - reward.redeemedCount
      );
    }

    // Update status
    await reward.updateStatus();
    await reward.save();

    return await reward.populate('business', 'name category coverImage');
  }

  /**
   * Get reward by ID
   */
  async getRewardById(
    rewardId: string,
    userId?: string
  ): Promise<IRewardModel & { userCanAfford?: boolean; userBalance?: number }> {
    const reward = await Reward.findById(rewardId).populate(
      'business',
      'name category coverImage locations businessEmail businessPhoneNumber'
    );

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }

    // Increment view count asynchronously
    reward.incrementViews().catch((error) => {
      console.error('Failed to increment views:', error);
    });

    // Check user affordability if userId provided
    let userCanAfford = false;
    let userBalance = 0;

    if (userId) {
      try {
        const balance = await pointsService.getUserBalance(userId);
        userBalance = balance.currentBalance;
        userCanAfford = balance.canAfford(reward.pointsCost);
      } catch (error) {
        userCanAfford = false;
      }
    }

    const result = reward.toObject() as IRewardModel & {
      userCanAfford?: boolean;
      userBalance?: number;
    };

    result.userCanAfford = userCanAfford;
    result.userBalance = userBalance;

    return result;
  }

  /**
   * Get rewards with filters
   */
  async getRewards(query: IRewardFilterQuery): Promise<IRewardResponse> {
    const {
      businessId,
      type,
      category,
      status,
      minPoints,
      maxPoints,
      featured,
      userId,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    interface IFilter {
      business?: Types.ObjectId;
      type?: string;
      category?: string;
      status?: string;
      featured?: boolean;
      pointsCost?: {
        $gte?: number;
        $lte?: number;
      };
      $text?: {
        $search: string;
      };
    }

    const filter: IFilter = {};

    if (businessId) filter.business = new Types.ObjectId(businessId as string);
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured;

    if (minPoints !== undefined || maxPoints !== undefined) {
      filter.pointsCost = {};
      if (minPoints !== undefined) filter.pointsCost.$gte = minPoints;
      if (maxPoints !== undefined) filter.pointsCost.$lte = maxPoints;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    // If featured, prioritize by priority
    if (featured) {
      sort.priority = -1;
      sort.createdAt = -1;
    }

    const [rewards, total] = await Promise.all([
      Reward.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('business', 'name category coverImage locations')
        .lean(),
      Reward.countDocuments(filter),
    ]);

    // Check user affordability if userId provided
    let userBalance = 0;
    if (userId) {
      try {
        const balance = await pointsService.getUserBalance(userId);
        userBalance = balance.currentBalance;
      } catch (error) {
        userBalance = 0;
      }
    }

    const rewardsWithAvailability = rewards.map((reward) => ({
      ...reward,
      isAvailable:
        reward.isActive &&
        reward.remainingCount > 0 &&
        new Date() >= new Date(reward.startDate) &&
        (!reward.expiryDate || new Date() <= new Date(reward.expiryDate)),
      userCanAfford: userId ? userBalance >= reward.pointsCost : undefined,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      rewards: rewardsWithAvailability as any,
      total,
      page,
      limit,
      meta: {
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get rewards by business
   */
  async getRewardsByBusiness(
    businessId: string,
    query: IRewardFilterQuery
  ): Promise<IRewardResponse> {
    return this.getRewards({
      ...query,
      businessId,
    });
  }

  /**
   * Delete reward (soft delete)
   */
  async deleteReward(rewardId: string, businessId?: string): Promise<void> {
    const reward = await Reward.findById(rewardId);

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }

    // If businessId provided, verify ownership
    if (businessId && reward.business.toString() !== businessId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have permission to delete this reward'
      );
    }

    // Soft delete by marking as inactive
    reward.isActive = false;
    reward.status = REWARD_STATUS.INACTIVE;
    await reward.save();
  }

  /**
   * Archive reward (permanent delete)
   */
  async archiveReward(rewardId: string): Promise<void> {
    const reward = await Reward.findByIdAndDelete(rewardId);

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }
  }

  /**
   * Upload codes to reward
   */
  async uploadCodes(
    rewardId: string,
    codes: string[],
    businessId?: string
  ): Promise<IRewardModel> {
    const reward = await Reward.findById(rewardId);

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }

    // If businessId provided, verify ownership
    if (businessId && reward.business.toString() !== businessId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have permission to update this reward'
      );
    }

    if (reward.type !== 'online') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.INVALID_REWARD_TYPE
      );
    }

    // Add new codes
    const newCodes = codes.map((code) => ({
      code: code.trim().toUpperCase(),
      isUsed: false,
      usedBy: undefined,
      usedAt: undefined,
    }));

    reward.codes = [...(reward.codes || []), ...newCodes];

    // Update remaining count
    const unusedCodesCount = reward.codes.filter((c) => !c.isUsed).length;
    reward.remainingCount = Math.min(
      unusedCodesCount,
      reward.redemptionLimit - reward.redeemedCount
    );

    await reward.save();

    return reward;
  }

  /**
   * Check reward availability
   */
  async checkAvailability(
    rewardId: string,
    userId?: string
  ): Promise<IRewardAvailability> {
    const reward = await Reward.findById(rewardId);

    if (!reward) {
      throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
    }

    const now = new Date();
    let isAvailable = true;
    let reason: string | undefined;
    let userCanAfford = false;
    let userBalance = 0;

    // Check if active
    if (!reward.isActive) {
      isAvailable = false;
      reason = REWARD_MESSAGES.INACTIVE;
    }
    // Check if started
    else if (reward.startDate > now) {
      isAvailable = false;
      reason = REWARD_MESSAGES.NOT_STARTED;
    }
    // Check if expired
    else if (reward.expiryDate && reward.expiryDate < now) {
      isAvailable = false;
      reason = REWARD_MESSAGES.EXPIRED;
    }
    // Check if sold out
    else if (reward.remainingCount <= 0) {
      isAvailable = false;
      reason = REWARD_MESSAGES.INSUFFICIENT_STOCK;
    }
    // For online rewards, check codes
    else if (
      reward.type === 'online' &&
      reward.codes &&
      reward.codes.length > 0
    ) {
      const availableCode = reward.codes.find((code) => !code.isUsed);
      if (!availableCode) {
        isAvailable = false;
        reason = REWARD_MESSAGES.NO_CODES_AVAILABLE;
      }
    }

    // Check user affordability
    if (userId && isAvailable) {
      try {
        const balance = await pointsService.getUserBalance(userId);
        userBalance = balance.currentBalance;
        userCanAfford = balance.canAfford(reward.pointsCost);

        if (!userCanAfford) {
          reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
        }
      } catch (error) {
        userCanAfford = false;
        reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
      }
    }

    return {
      isAvailable: isAvailable && (!userId || userCanAfford),
      reason,
      remainingCount: reward.remainingCount,
      userCanAfford,
      userBalance,
    };
  }

  /**
   * Get reward statistics
   */
  async getRewardStatistics(
    businessId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<IRewardStatistics> {
    interface IDateFilter {
      createdAt?: {
        $gte?: Date;
        $lte?: Date;
      };
    }

    const filter: Record<string, unknown> = {};
    if (businessId) filter.business = new Types.ObjectId(businessId);

    const dateFilter: IDateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const [overallStats, topRewards, categoryStats] = await Promise.all([
      Reward.aggregate([
        { $match: { ...filter, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalRewards: { $sum: 1 },
            activeRewards: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            expiredRewards: {
              $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
            },
            totalRedemptions: { $sum: '$redemptions' },
            totalViews: { $sum: '$views' },
          },
        },
      ]),
      Reward.find({ ...filter, ...dateFilter })
        .sort({ redemptions: -1 })
        .limit(10)
        .select('title redemptions')
        .lean(),
      Reward.aggregate([
        { $match: { ...filter, ...dateFilter } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = overallStats[0] || {
      totalRewards: 0,
      activeRewards: 0,
      expiredRewards: 0,
      totalRedemptions: 0,
      totalViews: 0,
    };

    return {
      totalRewards: stats.totalRewards,
      activeRewards: stats.activeRewards,
      expiredRewards: stats.expiredRewards,
      totalRedemptions: stats.totalRedemptions,
      totalViews: stats.totalViews,
      averageRedemptionRate:
        stats.totalViews > 0
          ? (stats.totalRedemptions / stats.totalViews) * 100
          : 0,
      topRewards: topRewards.map((reward: any) => ({
        reward: reward._id,
        title: reward.title,
        redemptions: reward.redemptions,
      })),
      rewardsByCategory: categoryStats.map((cat: any) => ({
        category: cat._id,
        count: cat.count,
      })),
    };
  }

  /**
   * Get featured rewards
   */
  async getFeaturedRewards(limit = 10): Promise<IRewardModel[]> {
    const now = new Date();

    return await Reward.find({
      featured: true,
      isActive: true,
      status: 'active',
      startDate: { $lte: now },
      $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }],
      remainingCount: { $gt: 0 },
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .populate('business', 'name category coverImage');
  }

  /**
   * Update expired rewards status (scheduled job)
   */
  async updateExpiredRewards(): Promise<void> {
    const now = new Date();

    await Reward.updateMany(
      {
        expiryDate: { $lte: now },
        status: { $ne: REWARD_STATUS.EXPIRED },
      },
      {
        $set: { status: REWARD_STATUS.EXPIRED },
      }
    );

    console.log('✅ Expired rewards updated');
  }

  /**
   * Update upcoming rewards to active (scheduled job)
   */
  async updateUpcomingRewards(): Promise<void> {
    const now = new Date();

    await Reward.updateMany(
      {
        startDate: { $lte: now },
        status: REWARD_STATUS.UPCOMING,
        isActive: true,
        remainingCount: { $gt: 0 },
        $or: [{ expiryDate: { $gte: now } }, { expiryDate: null }],
      },
      {
        $set: { status: REWARD_STATUS.ACTIVE },
      }
    );

    console.log('✅ Upcoming rewards activated');
  }
}

export const rewardService = new RewardService();
