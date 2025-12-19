/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { Badge, UserBadge, UserBadgeHistory } from './badge.model';
import { Donation } from '../Donation/donation.model';
import Client from '../Client/client.model';
import {
  BADGE_UNLOCK_TYPE,
  BADGE_TIER,
  TIER_ORDER_PROGRESSION,
  BADGE_MESSAGES,
  SEASONAL_PERIOD,
} from './badge.constant';
import { AppError, deleteFile } from '../../utils';
import httpStatus from 'http-status';
import {
  isRamadan,
  isDhulHijjah,
  isWinter,
  isBeforeEid,
  isLaylatAlQadr,
  isWithinTimeRange,
} from './badge.utils';
import {
  ICreateBadgePayload,
  IUpdateBadgePayload,
  IBadgeTierConfig,
} from './badge.interface';
import { getFileUrl } from '../../lib/upload';
import QueryBuilder from '../../builders/QueryBuilder';
import { getDateHeader, getTimeAgo } from '../../lib/filter-helper';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';

const createBadge = async (
  payload: ICreateBadgePayload,
  file?: Express.Multer.File
) => {
  const existing = await Badge.findOne({ name: payload.name });
  if (existing) {
    if (file) deleteFile(file.path); // Cleanup upload if duplicate
    throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
  }

  // Handle Icon Upload
  if (file) {
    payload.icon = getFileUrl(file);
  } else if (!payload.icon) {
    // If no file and no string URL provided
    throw new AppError(httpStatus.BAD_REQUEST, 'Badge icon is required');
  }

  const isSingleTier = payload.tiers.length === 1;
  return await Badge.create({ ...payload, isSingleTier });
};

const updateBadge = async (
  id: string,
  payload: IUpdateBadgePayload,
  file?: Express.Multer.File
) => {
  const badge = await Badge.findById(id);
  if (!badge) {
    if (file) deleteFile(file.path);
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);
  }

  // Handle Image Update
  if (file) {
    // Delete old image if it's a local file
    if (badge.icon && badge.icon.startsWith('/')) {
      deleteFile(`public${badge.icon}`);
    }
    payload.icon = getFileUrl(file);
  }

  // Check Name Uniqueness if changing name
  if (payload.name && payload.name !== badge.name) {
    const existing = await Badge.findOne({ name: payload.name });
    if (existing) {
      if (file) deleteFile(file.path);
      throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);
    }
  }

  return await Badge.findByIdAndUpdate(id, payload, { new: true });
};
const getBadgeById = async (id: string) => {
  const badge = await Badge.findById(id);
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, "Badge doesn't exist");
  }

  return badge;
};

const getAllBadges = async (query: Record<string, unknown>) => {
  const badgeQuery = new QueryBuilder(Badge.find(), query)
    .search(['name', 'description'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await badgeQuery.modelQuery;
  const meta = await badgeQuery.countTotal();

  return {
    meta,
    result,
  };
};

const deleteBadge = async (id: string) => {
  const badge = await Badge.findByIdAndUpdate(id, { isActive: false }); // Soft delete
  if (!badge) {
    throw new AppError(httpStatus.NOT_FOUND, "Badge doesn't exist");
  }
};

// --- USER PROGRESS ---

const getAllBadgesWithProgress = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const client = await Client.findOne({ auth: userId });
  if (!client) throw new AppError(httpStatus.NOT_FOUND, 'Client not found');

  // 1. Optimized Fetching using QueryBuilder for Badges
  const badgeQuery = new QueryBuilder(Badge.find({ isActive: true }), query)
    .search(['name', 'description'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const badges = await badgeQuery.modelQuery.lean();
  const meta = await badgeQuery.countTotal();

  // 2. Fetch UserBadges ONLY for the badges in the current result set
  const badgeIds = badges.map((b: any) => b._id);
  const userBadges = await UserBadge.find({
    user: client._id,
    badge: { $in: badgeIds },
  }).lean();

  const userBadgeMap = new Map(
    userBadges.map((ub: any) => [ub.badge.toString(), ub])
  );

  // 3. Map Results
  const result = badges.map((badge: any) => {
    const userBadge = userBadgeMap.get(badge._id.toString()) as any;

    const currentTierName =
      userBadge?.currentTier ||
      (badge.isSingleTier ? BADGE_TIER.ONE_TIER : BADGE_TIER.COLOUR);
    const isUnlocked = !!userBadge;

    // Determine next tier
    let nextTier: IBadgeTierConfig | undefined;
    if (!badge.isSingleTier) {
      const idx = TIER_ORDER_PROGRESSION.indexOf(currentTierName);
      if (idx !== -1 && idx < TIER_ORDER_PROGRESSION.length - 1) {
        const nextTierName = TIER_ORDER_PROGRESSION[idx + 1];
        nextTier = badge.tiers.find((t: any) => t.tier === nextTierName);
      }
    }

    // Calculate Percentage based on active requirement (ignore 0)
    let progressPercentage = 0;
    const count = userBadge?.progressCount || 0;
    const amount = userBadge?.progressAmount || 0;

    // Determine which requirement is driving the badge (count or amount)
    // If requirement is 0, it's ignored in percentage calculation
    const requiredTotal =
      (nextTier?.requiredCount || 0) > 0
        ? nextTier!.requiredCount
        : nextTier?.requiredAmount || 0;

    const currentProgress = (nextTier?.requiredCount || 0) > 0 ? count : amount;

    if (nextTier && requiredTotal > 0) {
      progressPercentage = Math.min(
        100,
        Math.round((currentProgress / requiredTotal) * 100)
      );
    } else if (userBadge?.isCompleted) {
      progressPercentage = 100;
    }

    // Calculate Remaining
    let remainingForNextTier = 0;
    if (nextTier) {
      if (nextTier.requiredCount > 0) {
        remainingForNextTier = Math.max(0, nextTier.requiredCount - count);
      } else if (nextTier.requiredAmount && nextTier.requiredAmount > 0) {
        remainingForNextTier = Math.max(0, nextTier.requiredAmount - amount);
      }
    }

    return {
      badge,
      userBadge, // Returning basic object, history separate
      isUnlocked,
      currentTier: currentTierName,
      nextTier,
      progressCount: count,
      progressAmount: amount,
      progressPercentage,
      remainingForNextTier,
    };
  });

  return { meta, result };
};

// --- HISTORY FETCHING (Lazy Load) ---

const getBadgeHistory = async (userId: string, badgeId: string) => {
  const client = await Client.findOne({ auth: userId });
  if (!client) throw new AppError(httpStatus.NOT_FOUND, 'Client not found');

  const badge = await Badge.findById(badgeId);
  if (!badge) throw new AppError(httpStatus.NOT_FOUND, 'Badge not found');

  // 1. Fetch User Badge Progress (for Header UI)
  const userBadge = await UserBadge.findOne({
    user: client._id,
    badge: badge._id,
  }).lean();

  // Calculate Tier Logic for UI ("Only 3 more... to reach Gold")
  let currentTier = userBadge?.currentTier || 'colour';
  let nextTierConfig = null;
  let remainingForNextTier = 0;
  let nextTierNameDisplay = 'Completed';

  if (badge.tiers && badge.tiers.length > 0) {
    const tierOrder = ['colour', 'bronze', 'silver', 'gold'];
    const currentIdx = tierOrder.indexOf(currentTier);

    // Find next tier configuration
    if (currentIdx !== -1 && currentIdx < tierOrder.length - 1) {
      const nextTierName = tierOrder[currentIdx + 1];
      nextTierConfig = badge.tiers.find((t: any) => t.tier === nextTierName);

      if (nextTierConfig) {
        nextTierNameDisplay = nextTierConfig.name; // e.g. "Gold"
        // Determine if progress is count-based or amount-based
        if (nextTierConfig.requiredCount > 0) {
          remainingForNextTier = Math.max(
            0,
            nextTierConfig.requiredCount - (userBadge?.progressCount || 0)
          );
        } else {
          remainingForNextTier = Math.max(
            0,
            (nextTierConfig.requiredAmount || 0) -
              (userBadge?.progressAmount || 0)
          );
        }
      }
    }
  }

  // 2. Fetch History using Aggregation (Optimized for UI)
  const rawHistory = await UserBadgeHistory.aggregate([
    {
      $match: {
        user: client._id,
        badge: badge._id,
      },
    },
    {
      $sort: { createdAt: -1 }, // Latest first
    },
    {
      $limit: 50, // Keep response size manageable
    },
    // Join Donation details
    {
      $lookup: {
        from: 'donations',
        localField: 'donation',
        foreignField: '_id',
        as: 'donationDetails',
      },
    },
    { $unwind: '$donationDetails' },
    // Join Organization for Logo/Name
    {
      $lookup: {
        from: 'organizations',
        localField: 'donationDetails.organization',
        foreignField: '_id',
        as: 'orgDetails',
      },
    },
    { $unwind: '$orgDetails' },
    {
      $project: {
        _id: 0,
        amount: '$contributionAmount',
        currency: '$donationDetails.currency',
        createdAt: 1, // Needed for grouping
        orgName: '$orgDetails.name',
        orgLogo: '$orgDetails.logoImage',
        tierUnlocked: '$tierAchieved', // Shows badge icon if this donation unlocked a tier
      },
    },
  ]);

  // 3. Post-Process: Group by Date Headers using helpers
  const groupedHistory: Record<string, any[]> = {};

  rawHistory.forEach((item) => {
    const date = new Date(item.createdAt);

    const dateHeader = getDateHeader(date);

    const timeAgo = getTimeAgo(date);

    const uiItem = {
      orgName: item.orgName,
      orgLogo: item.orgLogo,
      timeAgo: timeAgo,
      amount: `+${item.currency === 'USD' ? '$' : ''}${item.amount}`,
      tierUnlocked: item.tierUnlocked,
    };

    if (!groupedHistory[dateHeader]) {
      groupedHistory[dateHeader] = [];
    }
    groupedHistory[dateHeader].push(uiItem);
  });

  // Convert map to array for easy frontend iteration
  const historyList = Object.keys(groupedHistory).map((key) => ({
    title: key,
    data: groupedHistory[key],
  }));

  // 4. Calculate Percentage
  let percentage = 0;
  if (userBadge?.isCompleted) {
    percentage = 100;
  } else if (nextTierConfig) {
    const totalReq =
      nextTierConfig.requiredCount > 0
        ? nextTierConfig.requiredCount
        : (nextTierConfig.requiredAmount as number);
    const currentProg =
      nextTierConfig.requiredCount > 0
        ? userBadge?.progressCount || 0
        : userBadge?.progressAmount || 0;

    percentage = Math.min(100, Math.round((currentProg / totalReq) * 100));
  }

  // 5. Final Response
  return {
    badge: {
      name: badge.name,
      icon: badge.icon,
      description: badge.description,
    },
    progress: {
      currentTier: currentTier,
      nextTier: nextTierNameDisplay,
      remaining: remainingForNextTier,
      // Helps UI decide whether to say "3 more donations" or "$50 more dollars"
      unit: (nextTierConfig?.requiredCount || 0) > 0 ? 'donations' : 'amount',
      percentage,
    },
    recentDonations: historyList,
  };
};

// --- CORE ENGINE: CHECK & UPDATE (OPTIMIZED) ---

const checkAndUpdateBadgesForDonation = async (
  userId: string,
  donationId: string
) => {
  // 1. Fetch Donation & User (Lean for performance)
  const donation = await Donation.findById(donationId).populate('cause').lean();

  if (!donation) return;

  const client = await Client.findById(userId).select('_id').lean();
  if (!client) return;

  const donationDate = donation.donationDate || new Date();

  // 2. OPTIMIZATION: Build a Filter for Badges
  // Only fetch badges that MIGHT match this donation
  const query: any = {
    isActive: true,
    $or: [
      { unlockType: BADGE_UNLOCK_TYPE.DONATION_COUNT },
      { unlockType: BADGE_UNLOCK_TYPE.DONATION_AMOUNT },
      { unlockType: BADGE_UNLOCK_TYPE.DONATION_SIZE },
      // Add logic specific types:
      ...(donation.donationType === 'round-up'
        ? [
            { unlockType: BADGE_UNLOCK_TYPE.ROUND_UP },
            { unlockType: BADGE_UNLOCK_TYPE.ROUND_UP_AMOUNT },
          ]
        : []),
      ...(donation.donationType === 'recurring'
        ? [{ unlockType: BADGE_UNLOCK_TYPE.RECURRING_STREAK }]
        : []),
      ...(donation.cause
        ? [
            { unlockType: BADGE_UNLOCK_TYPE.CATEGORY_SPECIFIC },
            { unlockType: BADGE_UNLOCK_TYPE.UNIQUE_CATEGORIES },
          ]
        : []),
      // Time/Seasonal are always checked as they depend on date math
      { unlockType: BADGE_UNLOCK_TYPE.SEASONAL },
      { unlockType: BADGE_UNLOCK_TYPE.TIME_BASED },
      { unlockType: BADGE_UNLOCK_TYPE.FREQUENCY },
    ],
  };

  const relevantBadges = await Badge.find(query).lean();

  // 3. Process Loops in Parallel
  const updatePromises = relevantBadges.map(async (badge) => {
    let matchesCondition = false;

    // FIXED: Seasonal Checks - Now uses constants
    if (badge.unlockType === BADGE_UNLOCK_TYPE.SEASONAL) {
      if (
        badge.seasonalPeriod === SEASONAL_PERIOD.RAMADAN &&
        isRamadan(donationDate)
      )
        matchesCondition = true;
      else if (
        badge.seasonalPeriod === SEASONAL_PERIOD.DHUL_HIJJAH &&
        isDhulHijjah(donationDate)
      )
        matchesCondition = true;
      else if (
        badge.seasonalPeriod === SEASONAL_PERIOD.WINTER &&
        isWinter(donationDate)
      )
        matchesCondition = true;
      else if (
        badge.seasonalPeriod === SEASONAL_PERIOD.FITRAH_DEADLINE &&
        isBeforeEid(donationDate)
      )
        matchesCondition = true;
      else if (
        badge.seasonalPeriod === SEASONAL_PERIOD.LAYLAT_AL_QADR &&
        isLaylatAlQadr(donationDate)
      )
        matchesCondition = true;
    }

    // Time Based
    else if (
      badge.unlockType === BADGE_UNLOCK_TYPE.TIME_BASED &&
      badge.timeRange
    ) {
      if (
        isWithinTimeRange(
          donationDate,
          badge.timeRange.start,
          badge.timeRange.end
        )
      ) {
        matchesCondition = true;
      }
    }

    // Category Specific - Now normalizes comparison
    else if (badge.unlockType === BADGE_UNLOCK_TYPE.CATEGORY_SPECIFIC) {
      const cause = donation.cause as any;
      if (
        cause?.category &&
        badge.specificCategories &&
        badge.specificCategories.some(
          (badgeCat) => badgeCat.toLowerCase() === cause.category.toLowerCase()
        )
      ) {
        matchesCondition = true;
      }
    }

    // Behavior Specific
    else if (badge.unlockType === BADGE_UNLOCK_TYPE.ROUND_UP)
      matchesCondition = true;
    else if (badge.unlockType === BADGE_UNLOCK_TYPE.ROUND_UP_AMOUNT)
      matchesCondition = true;
    else if (badge.unlockType === BADGE_UNLOCK_TYPE.RECURRING_STREAK)
      matchesCondition = true;
    // Donation Size
    else if (badge.unlockType === BADGE_UNLOCK_TYPE.DONATION_SIZE) {
      if (badge.maxDonationAmount && donation.amount < badge.maxDonationAmount)
        matchesCondition = true;
    }

    // General Counters
    else if (
      badge.unlockType === BADGE_UNLOCK_TYPE.DONATION_COUNT ||
      badge.unlockType === BADGE_UNLOCK_TYPE.DONATION_AMOUNT
    ) {
      matchesCondition = true;
    }

    // Unique Causes or Frequency
    else if (
      badge.unlockType === BADGE_UNLOCK_TYPE.UNIQUE_CATEGORIES ||
      badge.unlockType === BADGE_UNLOCK_TYPE.FREQUENCY
    ) {
      matchesCondition = true;
    }

    if (matchesCondition) {
      return updateUserBadgeProgress(client._id, badge, donation, donationDate);
    }
  });

  await Promise.all(updatePromises);
};

const updateUserBadgeProgress = async (
  userId: Types.ObjectId,
  badge: any,
  donation: any,
  date: Date
) => {
  // 1. Prepare Atomic Update Operations
  const updateOps: any = {
    $inc: {
      progressAmount: donation.amount,
    },
    $set: {
      lastDonationDate: date,
    },
    $setOnInsert: {
      currentTier: badge.isSingleTier ? BADGE_TIER.ONE_TIER : BADGE_TIER.COLOUR,
      tiersUnlocked: [
        {
          tier: badge.isSingleTier ? BADGE_TIER.ONE_TIER : BADGE_TIER.COLOUR,
          unlockedAt: new Date(),
        },
      ],
      isCompleted: false,
      consecutiveMonths: 0,
      // REMOVED: progressCount: 0 to allow $inc to work without conflict
    },
  };

  // Only increment progressCount for non-frequency badges
  if (badge.unlockType !== BADGE_UNLOCK_TYPE.FREQUENCY) {
    updateOps.$inc.progressCount = 1;
  }

  // 2. Handle Unique Categories (Atomic Array Add)
  if (
    badge.unlockType === BADGE_UNLOCK_TYPE.UNIQUE_CATEGORIES &&
    donation.cause?.category
  ) {
    updateOps.$addToSet = { uniqueCategoryNames: donation.cause.category };
  }

  // 3. ATOMIC FIND-OR-CREATE-AND-UPDATE
  const userBadge = await UserBadge.findOneAndUpdate(
    { user: userId, badge: badge._id },
    updateOps,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  // 4. NEW: Create History Record for UI Optimization
  await UserBadgeHistory.create({
    user: userId,
    badge: badge._id,
    userBadge: userBadge._id,
    donation: donation._id,
    contributionAmount: donation.amount,
  });

  // 5. Special Handling for complex logic corrections
  let shouldSave = false;

  // Sync array length to progressCount for Unique Categories
  if (badge.unlockType === BADGE_UNLOCK_TYPE.UNIQUE_CATEGORIES) {
    const realCount = userBadge.uniqueCategoryNames.length;
    if (userBadge.progressCount !== realCount) {
      userBadge.progressCount = realCount;
      shouldSave = true;
    }
  }

  // Complete Frequency Logic (Monthly Streak)
  if (badge.unlockType === BADGE_UNLOCK_TYPE.FREQUENCY) {
    const currentDate = new Date(date);
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Check if we need to fetch donation history
    let needsHistoryCheck = true;

    if (userBadge.lastDonationDate) {
      const lastDate = new Date(userBadge.lastDonationDate);
      const lastMonth = lastDate.getMonth();
      const lastYear = lastDate.getFullYear();

      // Calculate month difference
      const monthsDiff =
        (currentYear - lastYear) * 12 + (currentMonth - lastMonth);

      if (monthsDiff === 0) {
        // Same month - no change to streak
        needsHistoryCheck = false;
      } else if (monthsDiff === 1) {
        // Consecutive month - increment
        userBadge.consecutiveMonths = (userBadge.consecutiveMonths || 0) + 1;
        userBadge.progressCount = userBadge.consecutiveMonths;
        shouldSave = true;
        needsHistoryCheck = false;
      } else if (monthsDiff > 1) {
        // Gap in months - need to check if this starts a new streak
        needsHistoryCheck = true;
      }
    }

    // If needed, check donation history to calculate the streak
    if (needsHistoryCheck) {
      const monthsWithDonations = await calculateConsecutiveMonths(
        userId,
        currentDate
      );
      userBadge.consecutiveMonths = monthsWithDonations;
      userBadge.progressCount = monthsWithDonations;
      shouldSave = true;
    }
  }

  if (shouldSave) await userBadge.save();

  // 6. Check Tier Upgrade
  await checkTierUpgrade(userBadge, badge);
};

// Helper function to calculate consecutive months
const calculateConsecutiveMonths = async (
  userId: Types.ObjectId,
  currentDate: Date
): Promise<number> => {
  // Get the client
  const client = await Client.findOne({ auth: userId }).lean();
  if (!client) return 1;

  // Find all donations for this user, sorted by date descending
  const donations = await Donation.find({
    client: client._id,
    status: 'completed',
  })
    .sort({ donationDate: -1 })
    .select('donationDate')
    .lean();

  if (donations.length === 0) return 1;

  // Group donations by month/year
  const monthsSet = new Set<string>();
  donations.forEach((donation) => {
    const date = new Date(donation.donationDate || donation.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthsSet.add(key);
  });

  // Count consecutive months from current month backwards
  let consecutiveCount = 0;
  let checkDate = new Date(currentDate);

  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}`;
    if (monthsSet.has(key)) {
      consecutiveCount++;
      // Move to previous month
      checkDate.setMonth(checkDate.getMonth() - 1);
    } else {
      break;
    }
  }

  return consecutiveCount;
};
const checkTierUpgrade = async (userBadge: any, badge: any) => {
  if (userBadge.isCompleted) return;

  const currentTier = userBadge.currentTier;

  // Find next tier in progression
  let nextTierName = '';
  const idx = TIER_ORDER_PROGRESSION.indexOf(currentTier);
  if (idx !== -1 && idx < TIER_ORDER_PROGRESSION.length - 1) {
    nextTierName = TIER_ORDER_PROGRESSION[idx + 1];
  } else if (badge.isSingleTier && !userBadge.isCompleted) {
    nextTierName = BADGE_TIER.ONE_TIER;
  }

  if (!nextTierName) return;

  const targetTierConfig = badge.tiers.find(
    (t: any) => t.tier === nextTierName
  );
  if (!targetTierConfig) return;

  // Check Logic (AND vs OR)
  let passed = false;
  const logic = badge.conditionLogic || 'or';

  // LOGIC FIX: Ignore requirements that are 0 (not set)
  const countReq = targetTierConfig.requiredCount || 0;
  const amountReq = targetTierConfig.requiredAmount || 0;

  const hasCountRequirement = countReq > 0;
  const hasAmountRequirement = amountReq > 0;

  // Check actual progress against config
  const countMet = hasCountRequirement && userBadge.progressCount >= countReq;
  const amountMet =
    hasAmountRequirement && userBadge.progressAmount >= amountReq;

  if (logic === 'or') {
    // If OR: At least one requirement must be Active AND Met
    // If both active, either can unlock.
    passed = countMet || amountMet;
  } else {
    // If AND: All Active requirements must be Met
    const isCountSatisfied = !hasCountRequirement || countMet;
    const isAmountSatisfied = !hasAmountRequirement || amountMet;
    passed = isCountSatisfied && isAmountSatisfied;
  }

  if (passed) {
    // UPGRADE!
    userBadge.currentTier = nextTierName;
    userBadge.tiersUnlocked.push({
      tier: nextTierName,
      unlockedAt: new Date(),
    });

    try {
      // 1. Fetch the client to get the Auth ID (required by Notification Model)
      const client = await Client.findById(userBadge.user);

      if (client && client.auth) {
        await createNotification(
          client.auth.toString(), // Receiver Auth ID
          NOTIFICATION_TYPE.BADGE_UNLOCKED,
          `Congratulations! You've unlocked the ${nextTierName} tier for the "${badge.name}" badge!`,
          badge._id.toString(),
          {
            tier: nextTierName,
            badgeName: badge.name,
            badgeId: badge._id.toString(),
          }
        );
      }
    } catch (error) {
      console.error('Failed to send badge notification:', error);
    }

    const latestHistory = await UserBadgeHistory.findOne({
      userBadge: userBadge._id,
    }).sort({ createdAt: -1 });
    if (latestHistory) {
      latestHistory.tierAchieved = nextTierName;
      await latestHistory.save();
    }

    if (nextTierName === BADGE_TIER.GOLD || badge.isSingleTier) {
      userBadge.isCompleted = true;
    }

    await userBadge.save();

    // Recursive check
    await checkTierUpgrade(userBadge, badge);
  }
};

export const badgeService = {
  createBadge,
  updateBadge,
  getBadgeById,
  getAllBadges,
  deleteBadge,
  getAllBadgesWithProgress,
  checkAndUpdateBadgesForDonation,
  getBadgeHistory,
};
