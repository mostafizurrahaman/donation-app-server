import { Types } from 'mongoose';
import { Badge, UserBadge } from './badge.model';
import Client from '../Client/client.model';
import Organization from '../Organization/organization.model';
import Cause from '../Causes/causes.model';
import { Donation } from '../Donation/donation.model';
import { pointsService } from '../Points/points.service';
import {
  ICreateBadgePayload,
  IUpdateBadgePayload,
  IAssignBadgePayload,
  IBadgeFilterQuery,
  IUserBadgeFilterQuery,
  IBadgeStatistics,
  IUserBadgeProgress,
} from './badge.interface';
import {
  BADGE_MESSAGES,
  BADGE_UNLOCK_TYPE,
  TIER_ORDER,
} from './badge.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';

class BadgeService {
  /**
   * Create a new badge
   */
  async createBadge(payload: ICreateBadgePayload): Promise<any> {
    // Check for duplicate name
    const existingBadge = await Badge.findOne({ name: payload.name });
    if (existingBadge) {
      throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
    }

    // Validate tier progression
    const sortedTiers = [...payload.tiers].sort(
      (a, b) => a.requiredCount - b.requiredCount
    );
    const tierOrder = ['colour', 'bronze', 'silver', 'gold'];
    const isValidOrder = sortedTiers.every(
      (tier, index) => tier.tier === tierOrder[index]
    );

    if (!isValidOrder) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Badge tiers must be in ascending order: colour < bronze < silver < gold'
      );
    }

    // Create badge
    const badge = await Badge.create({
      name: payload.name,
      description: payload.description,
      icon: payload.icon,
      tiers: payload.tiers,
      category: payload.category,
      unlockType: payload.unlockType,
      targetOrganization: payload.targetOrganization
        ? new Types.ObjectId(payload.targetOrganization as string)
        : undefined,
      targetCause: payload.targetCause
        ? new Types.ObjectId(payload.targetCause as string)
        : undefined,
      bonusPoints: payload.bonusPoints || 0,
      isActive: payload.isActive !== false,
      isVisible: payload.isVisible !== false,
      featured: payload.featured || false,
      priority: payload.featured ? 10 : 1,
    });

    return badge
      .populate('targetOrganization', 'name')
      .then((doc) => doc.populate('targetCause', 'name category'));
  }

  /**
   * Update a badge
   */
  async updateBadge(
    badgeId: string,
    payload: IUpdateBadgePayload
  ): Promise<any> {
    const badge = await Badge.findById(badgeId);

    if (!badge) {
      throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
    }

    // Check for duplicate name if name is being changed
    if (payload.name && payload.name !== badge.name) {
      const existingBadge = await Badge.findOne({ name: payload.name });
      if (existingBadge) {
        throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
      }
    }

    // Update fields
    if (payload.name !== undefined) badge.name = payload.name;
    if (payload.description !== undefined)
      badge.description = payload.description;
    if (payload.icon !== undefined) badge.icon = payload.icon;
    if (payload.tiers !== undefined) badge.tiers = payload.tiers;
    if (payload.category !== undefined) badge.category = payload.category;
    if (payload.unlockType !== undefined) badge.unlockType = payload.unlockType;
    if (payload.targetOrganization !== undefined)
      badge.targetOrganization = payload.targetOrganization
        ? new Types.ObjectId(payload.targetOrganization as string)
        : undefined;
    if (payload.targetCause !== undefined)
      badge.targetCause = payload.targetCause
        ? new Types.ObjectId(payload.targetCause as string)
        : undefined;
    if (payload.bonusPoints !== undefined)
      badge.bonusPoints = payload.bonusPoints;
    if (payload.isActive !== undefined) badge.isActive = payload.isActive;
    if (payload.isVisible !== undefined) badge.isVisible = payload.isVisible;
    if (payload.featured !== undefined) {
      badge.featured = payload.featured;
      badge.priority = payload.featured ? 10 : 1;
    }

    await badge.save();

    return badge
      .populate('targetOrganization', 'name')
      .then((doc) => doc.populate('targetCause', 'name category'));
  }

  /**
   * Get badge by ID
   */
  async getBadgeById(badgeId: string): Promise<any> {
    const badge = await Badge.findById(badgeId)
      .populate('targetOrganization', 'name logoImage')
      .populate('targetCause', 'name category');

    if (!badge) {
      throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
    }

    // Get user count for this badge
    const userCount = await UserBadge.countDocuments({ badge: badgeId });

    return {
      ...badge.toJSON(),
      userCount,
    };
  }

  /**
   * Get all badges with filters
   */
  async getBadges(query: IBadgeFilterQuery): Promise<{
    badges: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      category,
      unlockType,
      isActive,
      isVisible,
      featured,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter: any = {};

    if (category) filter.category = category;
    if (unlockType) filter.unlockType = unlockType;
    if (isActive !== undefined) filter.isActive = isActive;
    if (isVisible !== undefined) filter.isVisible = isVisible;
    if (featured !== undefined) filter.featured = featured;

    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Prioritize featured badges
    if (featured) {
      sort.priority = -1;
      sort.createdAt = -1;
    }

    const [badges, total] = await Promise.all([
      Badge.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('targetOrganization', 'name logoImage')
        .populate('targetCause', 'name category')
        .lean(),
      Badge.countDocuments(filter),
    ]);

    // Get user counts for each badge
    const badgeIds = badges.map((b) => b._id);
    const userCounts = await UserBadge.aggregate([
      { $match: { badge: { $in: badgeIds } } },
      { $group: { _id: '$badge', count: { $sum: 1 } } },
    ]);

    const userCountMap = new Map(
      userCounts.map((uc) => [uc._id.toString(), uc.count])
    );

    const badgesWithCounts = badges.map((badge) => ({
      ...badge,
      userCount: userCountMap.get(badge._id.toString()) || 0,
    }));

    return {
      badges: badgesWithCounts,
      total,
      page,
      limit,
    };
  }

  /**
   * Delete badge
   */
  async deleteBadge(badgeId: string): Promise<void> {
    const badge = await Badge.findById(badgeId);

    if (!badge) {
      throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
    }

    // Soft delete by marking as inactive
    badge.isActive = false;
    badge.isVisible = false;
    await badge.save();
  }

  /**
   * Assign badge to user
   */
  async assignBadgeToUser(payload: IAssignBadgePayload): Promise<any> {
    const userId = new Types.ObjectId(payload.userId as string);
    const badgeId = new Types.ObjectId(payload.badgeId as string);

    // Check if badge exists
    const badge = await Badge.findById(badgeId);
    if (!badge) {
      throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
    }

    // Check if user exists
    const user = await Client.findById(userId);
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check if already assigned
    const existingUserBadge = await UserBadge.findOne({
      user: userId,
      badge: badgeId,
    });

    if (existingUserBadge) {
      throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_ASSIGNED);
    }

    // Create user badge
    const initialTier = payload.initialTier || 'colour';
    const initialProgress = payload.initialProgress || 0;

    const userBadge = await UserBadge.create({
      user: userId,
      badge: badgeId,
      currentTier: initialTier,
      progressCount: initialProgress,
      progressAmount: 0,
      unlockedAt: new Date(),
      lastUpdatedAt: new Date(),
      tiersUnlocked: [
        {
          tier: initialTier,
          unlockedAt: new Date(),
        },
      ],
      isCompleted: initialTier === 'gold',
      completedAt: initialTier === 'gold' ? new Date() : undefined,
    });

    // Award bonus points if configured
    if (badge.bonusPoints && badge.bonusPoints > 0) {
      await pointsService.awardBadgeBonus(userId, badgeId, badge.bonusPoints);
    }

    return userBadge
      .populate('badge', 'name description icon tiers')
      .then((doc) => doc.populate('user', 'name image'));
  }

  /**
   * Get user badges
   */
  async getUserBadges(
    userId: string,
    query: IUserBadgeFilterQuery
  ): Promise<{
    userBadges: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      badgeId,
      currentTier,
      isCompleted,
      page = 1,
      limit = 20,
      sortBy = 'lastUpdatedAt',
      sortOrder = 'desc',
    } = query;

    const filter: any = { user: new Types.ObjectId(userId) };

    if (badgeId) filter.badge = new Types.ObjectId(badgeId);
    if (currentTier) filter.currentTier = currentTier;
    if (isCompleted !== undefined) filter.isCompleted = isCompleted;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [userBadges, total] = await Promise.all([
      UserBadge.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('badge', 'name description icon tiers category')
        .lean(),
      UserBadge.countDocuments(filter),
    ]);

    return {
      userBadges,
      total,
      page,
      limit,
    };
  }

  /**
   * Get user badge progress for a specific badge
   */
  async getUserBadgeProgress(
    userId: string,
    badgeId: string
  ): Promise<IUserBadgeProgress> {
    const badge = await Badge.findById(badgeId);
    if (!badge) {
      throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
    }

    const userBadge = await UserBadge.findOne({
      user: new Types.ObjectId(userId),
      badge: new Types.ObjectId(badgeId),
    });

    const isUnlocked = !!userBadge;
    const currentTier = userBadge?.currentTier || 'colour';
    const progressCount = userBadge?.progressCount || 0;

    // Get next tier
    let nextTier = null;
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    if (currentIndex < TIER_ORDER.length - 1) {
      const nextTierName = TIER_ORDER[currentIndex + 1];
      nextTier = badge.tiers.find((t) => t.tier === nextTierName) || null;
    }

    // Calculate progress percentage
    let progressPercentage = 0;
    let remainingForNextTier = 0;

    if (nextTier) {
      progressPercentage = Math.min(
        100,
        (progressCount / nextTier.requiredCount) * 100
      );
      remainingForNextTier = Math.max(
        0,
        nextTier.requiredCount - progressCount
      );
    } else {
      progressPercentage = 100; // Completed
    }

    return {
      badge,
      userBadge: userBadge || undefined,
      isUnlocked,
      currentTier,
      nextTier: nextTier || undefined,
      progressCount,
      progressPercentage: Math.round(progressPercentage),
      remainingForNextTier: nextTier ? remainingForNextTier : undefined,
    };
  }

  /**
   * Update user badge progress
   */
  async updateUserBadgeProgress(
    userId: string,
    badgeId: string,
    count: number,
    amount?: number
  ): Promise<any> {
    const userBadge = await UserBadge.findOne({
      user: new Types.ObjectId(userId),
      badge: new Types.ObjectId(badgeId),
    });

    if (!userBadge) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        BADGE_MESSAGES.USER_BADGE_NOT_FOUND
      );
    }

    const tierUpgraded = await userBadge.updateProgress(count, amount);

    // Award bonus points if tier was upgraded
    if (tierUpgraded) {
      const badge = await Badge.findById(badgeId);
      if (badge && badge.bonusPoints && badge.bonusPoints > 0) {
        await pointsService.awardBadgeBonus(userId, badgeId, badge.bonusPoints);
      }
    }

    return {
      userBadge: await userBadge.populate(
        'badge',
        'name description icon tiers'
      ),
      tierUpgraded,
    };
  }

  /**
   * Check and update badges for user based on donation
   */
  async checkAndUpdateBadgesForDonation(
    userId: Types.ObjectId | string,
    donationId: Types.ObjectId | string
  ): Promise<void> {
    const donation = await Donation.findById(donationId)
      .populate('organization')
      .populate('cause');

    if (!donation) return;

    // Get all active badges
    const badges = await Badge.find({ isActive: true, isVisible: true });

    for (const badge of badges) {
      let shouldUpdate = false;

      // Check if badge criteria matches
      switch (badge.unlockType) {
        case BADGE_UNLOCK_TYPE.DONATION_COUNT:
          shouldUpdate = true;
          break;

        case BADGE_UNLOCK_TYPE.CAUSE_SPECIFIC:
          if (
            badge.targetCause &&
            donation.cause &&
            badge.targetCause.toString() === donation.cause.toString()
          ) {
            shouldUpdate = true;
          }
          break;

        case BADGE_UNLOCK_TYPE.ORGANIZATION_SPECIFIC:
          if (
            badge.targetOrganization &&
            badge.targetOrganization.toString() ===
              donation.organization.toString()
          ) {
            shouldUpdate = true;
          }
          break;

        case BADGE_UNLOCK_TYPE.ROUND_UP:
          if (donation.donationType === 'round-up') {
            shouldUpdate = true;
          }
          break;

        case BADGE_UNLOCK_TYPE.DONATION_AMOUNT:
          shouldUpdate = true;
          break;
      }

      if (shouldUpdate) {
        // Check if user has this badge
        let userBadge = await UserBadge.findOne({
          user: new Types.ObjectId(userId as string),
          badge: badge._id,
        });

        if (!userBadge) {
          // Create new user badge
          userBadge = await UserBadge.create({
            user: new Types.ObjectId(userId as string),
            badge: badge._id,
            currentTier: 'colour',
            progressCount: 0,
            progressAmount: 0,
            unlockedAt: new Date(),
            lastUpdatedAt: new Date(),
            tiersUnlocked: [
              {
                tier: 'colour',
                unlockedAt: new Date(),
              },
            ],
            isCompleted: false,
          });
        }

        // Update progress
        await userBadge.updateProgress(1, donation.amount);
      }
    }
  }

  /**
   * Get badge statistics
   */
  async getBadgeStatistics(
    startDate?: Date,
    endDate?: Date
  ): Promise<IBadgeStatistics> {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const [overallStats, categoryStats, typeStats, topBadges] =
      await Promise.all([
        Badge.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              totalBadges: { $sum: 1 },
              activeBadges: {
                $sum: { $cond: ['$isActive', 1, 0] },
              },
            },
          },
        ]),
        Badge.aggregate([
          { $match: { ...dateFilter, category: { $exists: true } } },
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 },
            },
          },
        ]),
        Badge.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: '$unlockType',
              count: { $sum: 1 },
            },
          },
        ]),
        UserBadge.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: '$badge',
              userCount: { $sum: 1 },
            },
          },
          { $sort: { userCount: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'badges',
              localField: '_id',
              foreignField: '_id',
              as: 'badgeInfo',
            },
          },
          { $unwind: '$badgeInfo' },
          {
            $project: {
              badge: '$_id',
              name: '$badgeInfo.name',
              userCount: 1,
            },
          },
        ]),
      ]);

    const stats = overallStats[0] || {
      totalBadges: 0,
      activeBadges: 0,
    };

    const totalUserBadges = await UserBadge.countDocuments(dateFilter);
    const completedBadges = await UserBadge.countDocuments({
      ...dateFilter,
      isCompleted: true,
    });

    return {
      totalBadges: stats.totalBadges,
      activeBadges: stats.activeBadges,
      totalUserBadges,
      completedBadges,
      badgesByCategory: categoryStats.map((cat) => ({
        category: cat._id || 'Uncategorized',
        count: cat.count,
      })),
      badgesByType: typeStats.map((type) => ({
        unlockType: type._id,
        count: type.count,
      })),
      topBadges: topBadges.map((badge) => ({
        badge: badge.badge,
        name: badge.name,
        userCount: badge.userCount,
      })),
    };
  }

  /**
   * Get all badges with user progress
   */
  async getAllBadgesWithProgress(
    userId: string
  ): Promise<IUserBadgeProgress[]> {
    const badges = await Badge.find({
      isActive: true,
      isVisible: true,
    }).lean();

    const userBadges = await UserBadge.find({
      user: new Types.ObjectId(userId),
    }).lean();

    const userBadgeMap = new Map(
      userBadges.map((ub) => [ub.badge.toString(), ub])
    );

    const badgesWithProgress: IUserBadgeProgress[] = badges.map((badge) => {
      const userBadge = userBadgeMap.get(badge._id.toString());
      const isUnlocked = !!userBadge;
      const currentTier = userBadge?.currentTier || 'colour';
      const progressCount = userBadge?.progressCount || 0;

      // Get next tier
      let nextTier = null;
      const currentIndex = TIER_ORDER.indexOf(currentTier);
      if (currentIndex < TIER_ORDER.length - 1) {
        const nextTierName = TIER_ORDER[currentIndex + 1];
        nextTier =
          (badge.tiers as any[]).find((t) => t.tier === nextTierName) || null;
      }

      // Calculate progress
      let progressPercentage = 0;
      let remainingForNextTier = 0;

      if (nextTier) {
        progressPercentage = Math.min(
          100,
          (progressCount / nextTier.requiredCount) * 100
        );
        remainingForNextTier = Math.max(
          0,
          nextTier.requiredCount - progressCount
        );
      } else if (isUnlocked) {
        progressPercentage = 100;
      }

      return {
        badge: badge as any,
        userBadge: userBadge as any,
        isUnlocked,
        currentTier,
        nextTier: nextTier || undefined,
        progressCount,
        progressPercentage: Math.round(progressPercentage),
        remainingForNextTier: nextTier ? remainingForNextTier : undefined,
      };
    });

    return badgesWithProgress;
  }
}

export const badgeService = new BadgeService();
