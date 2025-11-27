// src/app/modules/badge/badge.service.ts

import { Types } from 'mongoose';
import { Badge, UserBadge } from './badge.model';
import Client from '../Client/client.model';
import { Donation } from '../Donation/donation.model';
import {
  ICreateBadgePayload,
  IUpdateBadgePayload,
  IAssignBadgePayload,
  IBadgeFilterQuery,
  IUserBadgeFilterQuery,
  IBadgeStatistics,
  IUserBadgeProgress,
  IBadgeTier,
} from './badge.interface';
import {
  BADGE_MESSAGES,
  BADGE_UNLOCK_TYPE,
  TIER_ORDER_PROGRESSION,
} from './badge.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import {
  getCurrentHijriYear,
  getSeasonalPeriod,
  isBeforeEid,
  isDhulHijjah,
  isLaylatAlQadr,
  isRamadan,
  isWinter,
  isWithinTimeRange,
} from './badge.utils';

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const toObjectId = (id?: string | Types.ObjectId | undefined) => {
  if (!id) return undefined;
  return typeof id === 'string'
    ? new Types.ObjectId(id)
    : (id as Types.ObjectId);
};

// ==========================================
// CRUD OPERATIONS
// ==========================================

/**
 * Create badge
 */
const createBadge = async (payload: ICreateBadgePayload): Promise<any> => {
  const existingBadge = await Badge.findOne({ name: payload.name });
  if (existingBadge) {
    throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
  }

  const tierCount = payload.tiers?.length || 0;
  if (tierCount !== 1 && tierCount !== 4) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Badge must have exactly 1 tier or 4 tiers'
    );
  }

  if (tierCount === 4) {
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
        'Badge tiers must be in ascending order'
      );
    }
  }

  const badge = await Badge.create({
    ...payload,
    isSingleTier: tierCount === 1,
    targetOrganization: toObjectId(payload.targetOrganization),
    targetCause: toObjectId(payload.targetCause),
    conditionLogic: payload.conditionLogic || 'both',
    isActive: payload.isActive !== false,
    isVisible: payload.isVisible !== false,
    priority: payload.featured ? 10 : 1,
  });

  return badge.populate([
    { path: 'targetOrganization', select: 'name' },
    { path: 'targetCause', select: 'name category' },
  ]);
};

/**
 * Update badge
 */
const updateBadge = async (
  badgeId: string,
  payload: IUpdateBadgePayload
): Promise<any> => {
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  if (payload.name && payload.name !== badge.name) {
    const existingBadge = await Badge.findOne({ name: payload.name });
    if (existingBadge) {
      throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
    }
  }

  Object.assign(badge, {
    ...payload,
    targetOrganization: payload.targetOrganization
      ? toObjectId(payload.targetOrganization)
      : badge.targetOrganization,
    targetCause: payload.targetCause
      ? toObjectId(payload.targetCause)
      : badge.targetCause,
    priority:
      payload.featured !== undefined
        ? payload.featured
          ? 10
          : 1
        : badge.priority,
  });

  await badge.save();

  return badge.populate([
    { path: 'targetOrganization', select: 'name' },
    { path: 'targetCause', select: 'name category' },
  ]);
};

/**
 * Get badge by ID
 */
const getBadgeById = async (badgeId: string): Promise<any> => {
  const badge = await Badge.findById(badgeId)
    .populate('targetOrganization', 'name logoImage')
    .populate('targetCause', 'name category');

  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  const userCount = await UserBadge.countDocuments({ badge: badgeId });

  return {
    ...badge.toJSON(),
    userCount,
  };
};

/**
 * Get all badges
 */
const getBadges = async (
  query: IBadgeFilterQuery
): Promise<{
  badges: any[];
  total: number;
  page: number;
  limit: number;
}> => {
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
  if (search) filter.$text = { $search: search };

  const skip = (page - 1) * limit;
  const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

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

  const badgeIds = badges.map((b: any) => b._id);
  const userCounts = await UserBadge.aggregate([
    { $match: { badge: { $in: badgeIds } } },
    { $group: { _id: '$badge', count: { $sum: 1 } } },
  ]);

  const userCountMap = new Map(
    userCounts.map((uc: any) => [uc._id.toString(), uc.count])
  );

  const badgesWithCounts = badges.map((badge: any) => ({
    ...badge,
    userCount: userCountMap.get(badge._id.toString()) || 0,
  }));

  return { badges: badgesWithCounts, total, page, limit };
};

/**
 * Delete badge (soft delete)
 */
const deleteBadge = async (badgeId: string): Promise<void> => {
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  badge.isActive = false;
  badge.isVisible = false;
  await badge.save();
};

/**
 * Assign badge to user
 */
const assignBadgeToUser = async (
  payload: IAssignBadgePayload
): Promise<any> => {
  const userId = toObjectId(payload.userId);
  const badgeId = toObjectId(payload.badgeId);

  if (!userId || !badgeId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user or badge id');
  }

  const badge = await Badge.findById(badgeId);
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  const user = await Client.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const existingUserBadge = await UserBadge.findOne({
    user: userId,
    badge: badgeId,
  });

  if (existingUserBadge) {
    throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_ASSIGNED);
  }

  const initialTier =
    payload.initialTier || (badge.isSingleTier ? 'one-tier' : 'colour');

  const userBadge = await UserBadge.create({
    user: userId,
    badge: badgeId,
    currentTier: initialTier,
    progressCount: payload.initialProgress || 0,
    progressAmount: 0,
    tiersUnlocked: [{ tier: initialTier, unlockedAt: new Date() }],
    isCompleted: initialTier === 'gold' || badge.isSingleTier,
    completedAt:
      initialTier === 'gold' || badge.isSingleTier ? new Date() : undefined,
  });

  return userBadge.populate([
    { path: 'badge', select: 'name description icon tiers' },
    { path: 'user', select: 'name image' },
  ]);
};

/**
 * Get user badges
 */
const getUserBadges = async (
  userId: string,
  query: IUserBadgeFilterQuery
): Promise<{
  userBadges: any[];
  total: number;
  page: number;
  limit: number;
}> => {
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

  if (badgeId) filter.badge = new Types.ObjectId(badgeId as string);
  if (currentTier) filter.currentTier = currentTier;
  if (isCompleted !== undefined) filter.isCompleted = isCompleted;

  const skip = (page - 1) * limit;
  const sort: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [userBadges, total] = await Promise.all([
    UserBadge.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('badge', 'name description icon tiers category')
      .lean(),
    UserBadge.countDocuments(filter),
  ]);

  return { userBadges, total, page, limit };
};

/**
 * Get user badge progress
 */
const getUserBadgeProgress = async (
  userId: string,
  badgeId: string
): Promise<IUserBadgeProgress> => {
  const badge = await Badge.findById(badgeId);
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  const userBadge = await UserBadge.findOne({
    user: toObjectId(userId),
    badge: toObjectId(badgeId),
  });

  const isUnlocked = !!userBadge;
  const currentTier =
    userBadge?.currentTier || (badge.isSingleTier ? 'one-tier' : 'colour');
  const progressCount = userBadge?.progressCount || 0;
  const progressAmount = userBadge?.progressAmount || 0;

  let nextTier = null;
  if (!badge.isSingleTier) {
    const currentIndex = TIER_ORDER_PROGRESSION.indexOf(currentTier);
    if (currentIndex < TIER_ORDER_PROGRESSION.length - 1) {
      const nextTierName = TIER_ORDER_PROGRESSION[currentIndex + 1];
      nextTier =
        (badge.tiers as IBadgeTier[]).find((t) => t.tier === nextTierName) ||
        null;
    }
  }

  let progressPercentage = 0;
  let remainingForNextTier = 0;

  if (nextTier) {
    progressPercentage = Math.min(
      100,
      (progressCount / nextTier.requiredCount) * 100
    );
    remainingForNextTier = Math.max(0, nextTier.requiredCount - progressCount);
  } else if (badge.isSingleTier) {
    progressPercentage = isUnlocked ? 100 : 0;
  } else {
    progressPercentage = 100;
  }

  return {
    badge: badge.toObject(),
    userBadge: userBadge?.toObject(),
    isUnlocked,
    currentTier,
    nextTier: nextTier || undefined,
    progressCount,
    progressAmount,
    progressPercentage: Math.round(progressPercentage),
    remainingForNextTier: nextTier ? remainingForNextTier : undefined,
  };
};

/**
 * Update user badge progress
 */
const updateUserBadgeProgress = async (
  userId: string,
  badgeId: string,
  count: number,
  amount?: number
): Promise<any> => {
  const userBadge = await UserBadge.findOne({
    user: toObjectId(userId),
    badge: toObjectId(badgeId),
  });

  if (!userBadge) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      BADGE_MESSAGES.USER_BADGE_NOT_FOUND
    );
  }

  const tierUpgraded = await (userBadge as any).updateProgress(count, amount);

  const updatedUserBadge = await userBadge.populate(
    'badge',
    'name description icon tiers'
  );

  return {
    userBadge: updatedUserBadge,
    tierUpgraded,
  };
};

// ==========================================
// BADGE CHECKING LOGIC
// ==========================================

/**
 * Check if donation matches badge filters
 */
const doesDonationMatchFilters = (
  donation: any,
  badge: any,
  donationDate: Date
): boolean => {
  const filters = badge.donationFilters;

  // Check donation type
  if (filters?.donationType && donation.donationType !== filters.donationType) {
    return false;
  }

  // Check amount range
  if (filters?.maxAmount && donation.amount > filters.maxAmount) {
    return false;
  }
  if (filters?.minAmount && donation.amount < filters.minAmount) {
    return false;
  }

  // Check specific category
  if (filters?.specificCategory) {
    const cause = donation.cause as any;
    if (!cause || cause.category !== filters.specificCategory) {
      return false;
    }
  }

  // Check multiple categories (for Global Giver: Refugees OR Emergencies)
  if (filters?.specificCategories && filters.specificCategories.length > 0) {
    const cause = donation.cause as any;
    if (!cause || !filters.specificCategories.includes(cause.category)) {
      return false;
    }
  }

  // Check seasonal period
  if (badge.seasonalPeriod) {
    if (badge.seasonalPeriod === 'laylat_al_qadr') {
      if (!isLaylatAlQadr(donationDate)) return false;
    } else if (badge.seasonalPeriod === 'zakat_fitr') {
      if (!isBeforeEid(donationDate)) return false;
    } else if (badge.seasonalPeriod === 'ramadan') {
      if (!isRamadan(donationDate)) return false;
    } else if (badge.seasonalPeriod === 'dhul_hijjah') {
      if (!isDhulHijjah(donationDate)) return false;
    } else if (badge.seasonalPeriod === 'winter') {
      if (!isWinter(donationDate)) return false;
    }
  }

  // Check time range
  if (badge.timeRange) {
    if (
      !isWithinTimeRange(
        donationDate,
        badge.timeRange.start,
        badge.timeRange.end
      )
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Check and update badges for donation
 */
const checkAndUpdateBadgesForDonation = async (
  userId: Types.ObjectId | string,
  donationId: Types.ObjectId | string
): Promise<void> => {
  console.log(
    `🏅 Starting badge check for user: ${userId}, donation: ${donationId}`
  );

  const donation = await Donation.findById(donationId)
    .populate('organization')
    .populate('cause');

  if (!donation) {
    console.log(`❌ Donation not found: ${donationId}`);
    return;
  }

  const donationDate = donation.donationDate || new Date();
  const normalizedUserId = toObjectId(userId);

  if (!normalizedUserId) {
    console.log(`❌ Invalid user ID: ${userId}`);
    return;
  }

  // Get all active badges
  const badges = await Badge.find({ isActive: true, isVisible: true });

  console.log(`📋 Found ${badges.length} active badges to check`);

  for (const badge of badges) {
    try {
      let shouldUpdate = false;

      switch (badge.unlockType) {
        // ✅ FIRST TIME: First ever donation
        case BADGE_UNLOCK_TYPE.FIRST_TIME:
          {
            const donationCount = await Donation.countDocuments({
              donor: normalizedUserId,
              status: 'completed',
            });
            shouldUpdate = donationCount === 1;
          }
          break;

        // ✅ DONATION COUNT: Any donation
        case BADGE_UNLOCK_TYPE.DONATION_COUNT:
          shouldUpdate = true;
          break;

        // ✅ DONATION AMOUNT: Track total amount
        case BADGE_UNLOCK_TYPE.DONATION_AMOUNT:
          shouldUpdate = true;
          break;

        // ✅ AMOUNT THRESHOLD: Top Contributor
        case BADGE_UNLOCK_TYPE.AMOUNT_THRESHOLD:
          shouldUpdate = true;
          break;

        // ✅ CAUSE SPECIFIC: Specific cause
        case BADGE_UNLOCK_TYPE.CAUSE_SPECIFIC:
          if (
            badge.targetCause &&
            donation.cause &&
            badge.targetCause.toString() ===
              (donation.cause as any)._id.toString()
          ) {
            shouldUpdate = true;
          }
          break;

        // ✅ CATEGORY SPECIFIC: Category-based (Water, Youth, etc.)
        case BADGE_UNLOCK_TYPE.CATEGORY_SPECIFIC:
          {
            const cause = donation.cause as any;
            const filters = badge.donationFilters;

            // Single category
            if (filters?.specificCategory && cause) {
              if (cause.category === filters.specificCategory) {
                shouldUpdate = true;
              }
            }

            // Multiple categories (e.g., Refugees OR Emergencies)
            if (
              filters?.specificCategories &&
              filters.specificCategories.length > 0 &&
              cause
            ) {
              if (filters.specificCategories.includes(cause.category)) {
                shouldUpdate = true;
              }
            }
          }
          break;

        // ✅ ORGANIZATION SPECIFIC
        case BADGE_UNLOCK_TYPE.ORGANIZATION_SPECIFIC:
          if (
            badge.targetOrganization &&
            badge.targetOrganization.toString() ===
              (donation.organization as any)._id.toString()
          ) {
            shouldUpdate = true;
          }
          break;

        // ✅ ROUND UP: Round-up donation count
        case BADGE_UNLOCK_TYPE.ROUND_UP:
          if (donation.donationType === 'round-up') {
            shouldUpdate = true;
          }
          break;

        // ✅ ROUND UP AMOUNT: Total round-up amount
        case BADGE_UNLOCK_TYPE.ROUND_UP_AMOUNT:
          if (donation.donationType === 'round-up') {
            shouldUpdate = true;
          }
          break;

        // ✅ DONATION SIZE: Donations under specific amount
        case BADGE_UNLOCK_TYPE.DONATION_SIZE:
          if (doesDonationMatchFilters(donation, badge, donationDate)) {
            shouldUpdate = true;
          }
          break;

        // ✅ SEASONAL: Ramadan, Qurban, Winter, etc.
        case BADGE_UNLOCK_TYPE.SEASONAL:
          if (doesDonationMatchFilters(donation, badge, donationDate)) {
            shouldUpdate = true;
          }
          break;

        // ✅ TIME BASED: Midnight Giver
        case BADGE_UNLOCK_TYPE.TIME_BASED:
          if (doesDonationMatchFilters(donation, badge, donationDate)) {
            shouldUpdate = true;
          }
          break;

        // ✅ RECURRING STREAK: Set & Forget
        case BADGE_UNLOCK_TYPE.RECURRING_STREAK:
          if (donation.donationType === 'recurring') {
            shouldUpdate = true;
          }
          break;

        // ✅ FREQUENCY: Monthly Mover
        case BADGE_UNLOCK_TYPE.FREQUENCY:
          shouldUpdate = true;
          break;

        // ✅ UNIQUE CAUSES: Cause Explorer
        case BADGE_UNLOCK_TYPE.UNIQUE_CAUSES:
          if (donation.cause) {
            shouldUpdate = true;
          }
          break;

        default:
          console.log(`⚠️ Unhandled unlock type: ${badge.unlockType}`);
      }

      if (shouldUpdate) {
        await updateBadgeForUser(
          normalizedUserId,
          badge,
          donation,
          donationDate
        );
      }
    } catch (error) {
      console.error(`❌ Error checking badge ${badge.name}:`, error);
    }
  }

  console.log(`✅ Badge check completed for donation: ${donationId}`);
};

/**
 * Update badge for user
 */
const updateBadgeForUser = async (
  userId: Types.ObjectId,
  badge: any,
  donation: any,
  donationDate: Date
): Promise<void> => {
  // Find or create user badge
  let userBadge = await UserBadge.findOne({
    user: userId,
    badge: badge._id,
  });

  if (!userBadge) {
    console.log(
      `📝 Creating new user badge: ${badge.name} for user: ${userId}`
    );
    const initialTier = badge.isSingleTier ? 'one-tier' : 'colour';
    userBadge = await UserBadge.create({
      user: userId,
      badge: badge._id,
      currentTier: initialTier,
      progressCount: 0,
      progressAmount: 0,
      tiersUnlocked: [{ tier: initialTier, unlockedAt: new Date() }],
      isCompleted: false,
    });
  }

  // Prepare metadata
  const metadata: any = {
    causeId: donation.cause?._id || donation.cause,
    donationDate,
    isRecurring: donation.donationType === 'recurring',
  };

  let countIncrement = 1;
  let amountIncrement = donation.amount;

  // Special handling
  if (badge.unlockType === BADGE_UNLOCK_TYPE.UNIQUE_CAUSES) {
    // Cause Explorer: Count unique causes
    if (donation.cause) {
      await (userBadge as any).addUniqueCause(
        donation.cause._id || donation.cause
      );
      countIncrement = 0;
      userBadge.progressCount = (userBadge.uniqueCauses || []).length;
    }
  } else if (badge.unlockType === BADGE_UNLOCK_TYPE.RECURRING_STREAK) {
    // Recurring streak: Track consecutive months
    countIncrement = 0;
    await (userBadge as any).updateConsecutiveMonths(donationDate);
    userBadge.progressCount = userBadge.consecutiveMonths || 1;
  } else if (badge.unlockType === BADGE_UNLOCK_TYPE.FREQUENCY) {
    // Monthly Mover: Track consecutive months
    countIncrement = 0;
    await (userBadge as any).updateConsecutiveMonths(donationDate);
    userBadge.progressCount = userBadge.consecutiveMonths || 1;
  } else if (badge.unlockType === BADGE_UNLOCK_TYPE.SEASONAL) {
    // Seasonal: Track by period/year
    const period = badge.seasonalPeriod || getSeasonalPeriod(donationDate);
    const year = getCurrentHijriYear();
    if (period) {
      await (userBadge as any).addSeasonalDonation(
        period,
        donation.amount,
        year
      );

      const seasonalStats = (userBadge.seasonalDonations || []).find(
        (sd: any) => sd.period === period && sd.year === year
      );

      if (seasonalStats) {
        userBadge.progressCount = seasonalStats.count;
        userBadge.progressAmount = seasonalStats.amount;
        countIncrement = 0;
        amountIncrement = 0;
      }
    }
  }

  // Update progress
  if (countIncrement > 0 || amountIncrement > 0) {
    await (userBadge as any).updateProgress(
      countIncrement,
      amountIncrement,
      metadata
    );
  } else {
    await userBadge.save();
    await (userBadge as any).checkTierUpgrade();
  }

  console.log(`✅ Updated badge: ${badge.name} for user: ${userId}`);
  console.log(
    `   Progress: ${userBadge.progressCount} | Amount: $${userBadge.progressAmount}`
  );
};

// ==========================================
// STATISTICS
// ==========================================

/**
 * Get badge statistics
 */
const getBadgeStatistics = async (
  startDate?: Date,
  endDate?: Date
): Promise<IBadgeStatistics> => {
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = startDate;
    if (endDate) dateFilter.createdAt.$lte = endDate;
  }

  const [overallStats, categoryStats, typeStats, topBadges] = await Promise.all(
    [
      Badge.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalBadges: { $sum: 1 },
            activeBadges: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]),
      Badge.aggregate([
        { $match: { ...dateFilter, category: { $exists: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Badge.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$unlockType', count: { $sum: 1 } } },
      ]),
      UserBadge.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$badge', userCount: { $sum: 1 } } },
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
    ]
  );

  const stats = overallStats[0] || { totalBadges: 0, activeBadges: 0 };

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
    badgesByCategory: categoryStats.map((cat: any) => ({
      category: cat._id || 'Uncategorized',
      count: cat.count,
    })),
    badgesByType: typeStats.map((type: any) => ({
      unlockType: type._id,
      count: type.count,
    })),
    topBadges: topBadges.map((badge: any) => ({
      badge: badge.badge,
      name: badge.name,
      userCount: badge.userCount,
    })),
  };
};

/**
 * Get all badges with user progress
 */
const getAllBadgesWithProgress = async (
  userId: string
): Promise<IUserBadgeProgress[]> => {
  const badges = await Badge.find({
    isActive: true,
    isVisible: true,
  }).lean();

  const userBadges = await UserBadge.find({
    user: new Types.ObjectId(userId),
  }).lean();

  const userBadgeMap = new Map(
    userBadges.map((ub: any) => [ub.badge.toString(), ub])
  );

  const badgesWithProgress: IUserBadgeProgress[] = badges.map((badge: any) => {
    const userBadge = userBadgeMap.get(badge._id.toString()) as any;
    const isUnlocked = !!userBadge;
    const currentTier =
      userBadge?.currentTier || (badge.isSingleTier ? 'one-tier' : 'colour');
    const progressCount = userBadge?.progressCount || 0;
    const progressAmount = userBadge?.progressAmount || 0;

    let nextTier = null;
    if (!badge.isSingleTier) {
      const currentIndex = TIER_ORDER_PROGRESSION.indexOf(currentTier);
      if (currentIndex < TIER_ORDER_PROGRESSION.length - 1) {
        const nextTierName = TIER_ORDER_PROGRESSION[currentIndex + 1];
        nextTier =
          (badge.tiers as IBadgeTier[]).find((t) => t.tier === nextTierName) ||
          null;
      }
    }

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
    } else if (badge.isSingleTier) {
      progressPercentage = isUnlocked ? 100 : 0;
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
      progressAmount,
      progressPercentage: Math.round(progressPercentage),
      remainingForNextTier: nextTier ? remainingForNextTier : undefined,
    };
  });

  return badgesWithProgress;
};

// ==========================================
// EXPORT SERVICE
// ==========================================

export const badgeService = {
  createBadge,
  updateBadge,
  getBadgeById,
  getBadges,
  deleteBadge,
  assignBadgeToUser,
  getUserBadges,
  getUserBadgeProgress,
  updateUserBadgeProgress,
  checkAndUpdateBadgesForDonation,
  getBadgeStatistics,
  getAllBadgesWithProgress,
};
