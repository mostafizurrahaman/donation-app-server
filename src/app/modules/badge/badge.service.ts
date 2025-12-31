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
import { AppError, uploadToS3 } from '../../utils';
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

import QueryBuilder from '../../builders/QueryBuilder';
import { getDateHeader, getTimeAgo } from '../../lib/filter-helper';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';
import { deleteFromS3, getS3KeyFromUrl } from '../../utils/s3.utils';

const createBadge = async (
  payload: ICreateBadgePayload,
  files?: Record<string, Express.Multer.File[]>
) => {
  const existing = await Badge.findOne({ name: payload.name });
  if (existing)
    throw new AppError(httpStatus.CONFLICT, BADGE_MESSAGES.ALREADY_EXISTS);

  // 1. Upload Main Icon (GLB)
  if (files?.mainIcon?.[0]) {
    const uploadResult = await uploadToS3({
      buffer: files.mainIcon[0].buffer,
      key: `badge-main-${Date.now()}`,
      contentType: 'model/gltf-binary',
      folder: 'badges/main',
    });
    payload.icon = uploadResult.url;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Main badge icon is required');
  }

  // 2. Upload Tier Icons (GLB)
  const tiers = payload.tiers;

  for (const tierConfig of tiers) {
    const fieldName = `tier_${tierConfig.tier}`;
    const animationField = `tier_${tierConfig.tier}_animation`;
    const smallIconField = `tier_${tierConfig.tier}_smallIcon`;

    const icon = files?.[fieldName]?.[0];
    const animation = files?.[animationField]?.[0];
    const smallIcon = files?.[smallIconField]?.[0];

    if (icon) {
      const uploadResult = await uploadToS3({
        buffer: icon.buffer,
        key: `badge-tier-${tierConfig.tier}-${Date.now()}`,
        contentType: 'model/gltf-binary',
        folder: 'badges/tiers',
      });
      tierConfig.icon = uploadResult.url;
    } else {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Icon for tier ${tierConfig.tier} is missing`
      );
    }

    if (animation) {
      const uploadResult = await uploadToS3({
        buffer: animation.buffer,
        key: `badge-tier-${tierConfig.tier}-animation-${Date.now()}`,
        contentType: 'model/gltf-binary',
        folder: 'badges/tiers',
      });
      tierConfig.animationUrl = uploadResult.url;
    } else {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Animation for tier ${tierConfig.tier} is missing`
      );
    }

    if (smallIcon) {
      const uploadResult = await uploadToS3({
        buffer: smallIcon.buffer,
        key: `badge-tier-${tierConfig.tier}-small-${Date.now()}`,
        contentType: 'model/gltf-binary',
        folder: 'badges/tiers',
      });
      tierConfig.smallIconUrl = uploadResult.url;
    } else {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Small icon for tier ${tierConfig.tier} is missing`
      );
    }
  }

  const isSingleTier = tiers.length === 1;
  return await Badge.create({ ...payload, tiers, isSingleTier });
};

const updateBadge = async (
  id: string,
  payload: IUpdateBadgePayload,
  files?: Record<string, Express.Multer.File[]>
) => {
  const badge = await Badge.findById(id);
  if (!badge)
    throw new AppError(httpStatus.NOT_FOUND, BADGE_MESSAGES.NOT_FOUND);

  // 1. Update Main Icon if provided
  if (files?.mainIcon?.[0]) {
    if (badge.icon) {
      const oldKey = getS3KeyFromUrl(badge.icon);
      if (oldKey) await deleteFromS3(oldKey).catch(() => null);
    }
    const uploadResult = await uploadToS3({
      buffer: files.mainIcon[0].buffer,
      key: `badge-main-upd-${Date.now()}`,
      contentType: 'model/gltf-binary',
      folder: 'badges/main',
    });
    payload.icon = uploadResult.url;
  }

  // 2. Update Tiers and their Icons
  if (payload.tiers) {
    for (const tierConfig of payload.tiers) {
      const fieldName = `tier_${tierConfig.tier}`;
      const animationField = `tier_${tierConfig.tier}_animation`;
      const smallIconField = `tier_${tierConfig.tier}_smallIcon`;

      const icon = files?.[fieldName]?.[0];
      const animation = files?.[animationField]?.[0];
      const smallIcon = files?.[smallIconField]?.[0];

      if (icon) {
        // Delete old tier icon if it existed
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier?.icon) {
          const oldKey = getS3KeyFromUrl(existingTier.icon);
          if (oldKey) await deleteFromS3(oldKey).catch(() => null);
        }

        const uploadResult = await uploadToS3({
          buffer: icon.buffer,
          key: `badge-tier-upd-${tierConfig.tier}-${Date.now()}`,
          contentType: 'model/gltf-binary',
          folder: 'badges/tiers',
        });
        tierConfig.icon = uploadResult.url;
      } else {
        // Keep existing icon if no new file uploaded for this tier
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier) tierConfig.icon = existingTier.icon;
      }

      if (animation) {
        // Delete old tier animation if it existed
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier?.animationUrl) {
          const oldKey = getS3KeyFromUrl(existingTier.animationUrl);
          if (oldKey) await deleteFromS3(oldKey).catch(() => null);
        }

        const uploadResult = await uploadToS3({
          buffer: animation.buffer,
          key: `badge-tier-upd-${tierConfig.tier}-animation-${Date.now()}`,
          contentType: 'model/gltf-binary',
          folder: 'badges/tiers',
        });
        tierConfig.animationUrl = uploadResult.url;
      } else {
        // Keep existing animation if no new file uploaded for this tier
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier) tierConfig.animationUrl = existingTier.animationUrl;
      }

      if (smallIcon) {
        // Delete old tier smallIcon if it existed
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier?.smallIconUrl) {
          const oldKey = getS3KeyFromUrl(existingTier.smallIconUrl);
          if (oldKey) await deleteFromS3(oldKey).catch(() => null);
        }

        const uploadResult = await uploadToS3({
          buffer: smallIcon.buffer,
          key: `badge-tier-upd-${tierConfig.tier}-smallIcon-${Date.now()}`,
          contentType: 'model/gltf-binary',
          folder: 'badges/tiers',
        });
        tierConfig.smallIconUrl = uploadResult.url;
      } else {
        // Keep existing smallIcon if no new file uploaded for this tier
        const existingTier = badge.tiers.find(
          (t) => t.tier === tierConfig.tier
        );
        if (existingTier) tierConfig.smallIconUrl = existingTier.smallIconUrl;
      }
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

/**
 * Retrieves all badges and calculates user-specific progress.
 * Correctly handles RequiredCount: 0 or RequiredAmount: 0 as "Inactive" requirements.
 */
const getAllBadgesWithProgress = async (
  userId: string,
  query: Record<string, unknown>
) => {
  // 1. Resolve Client
  const client = await Client.findOne({ auth: userId });
  if (!client) throw new AppError(httpStatus.NOT_FOUND, 'Client not found');

  // 2. Fetch Badges (using QueryBuilder for pagination/search/filters)
  const badgeQuery = new QueryBuilder(Badge.find({ isActive: true }), query)
    .search(['name', 'description'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const badges = await badgeQuery.modelQuery.lean();
  const meta = await badgeQuery.countTotal();

  // 3. Fetch User Progress for these specific badges
  const badgeIds = badges.map((b: any) => b._id);
  const userBadges = await UserBadge.find({
    user: client._id,
    badge: { $in: badgeIds },
  }).lean();

  const userBadgeMap = new Map(
    userBadges.map((ub: any) => [ub.badge.toString(), ub])
  );

  // 4. Map and Calculate Progress
  const result = badges.map((badge: any) => {
    const userBadge = userBadgeMap.get(badge._id.toString()) as any;

    // Determine the current tier name
    const currentTierName =
      userBadge?.currentTier || (badge.isSingleTier ? 'one-tier' : 'colour');
    const isCompleted = userBadge?.isCompleted || false;

    // Identify the Next Target Tier
    let nextTier: any = undefined;
    if (!isCompleted) {
      if (badge.isSingleTier) {
        nextTier = badge.tiers[0];
      } else {
        const currentIdx = TIER_ORDER_PROGRESSION.indexOf(currentTierName);
        const nextTierName = TIER_ORDER_PROGRESSION[currentIdx + 1];
        nextTier = badge.tiers.find((t: any) => t.tier === nextTierName);
      }
    }

    // --- LOGIC ENGINE START ---
    let progressPercentage = 0;
    let remainingForNextTier = 0;
    let unit: 'donations' | 'amount' = 'donations';

    if (isCompleted) {
      progressPercentage = 100;
    } else if (nextTier) {
      const countReq = nextTier.requiredCount || 0;
      const amountReq = nextTier.requiredAmount || 0;
      const curCount = userBadge?.progressCount || 0;
      const curAmount = userBadge?.progressAmount || 0;

      // Identify Active Requirements (ignore if 0)
      const isCountActive = countReq > 0;
      const isAmountActive = amountReq > 0;

      // Calculate individual percentages for active requirements
      const countPct = isCountActive
        ? Math.min(100, (curCount / countReq) * 100)
        : null;
      const amountPct = isAmountActive
        ? Math.min(100, (curAmount / amountReq) * 100)
        : null;

      if (isCountActive && isAmountActive) {
        // CASE: Both Count and Amount are required
        if (badge.conditionLogic === 'or') {
          // OR: Take the best performing metric
          progressPercentage = Math.max(countPct || 0, amountPct || 0);

          // UI Helper: Show remaining for the one that is closest to finishing
          if (countPct! >= amountPct!) {
            remainingForNextTier = Math.max(0, countReq - curCount);
            unit = 'donations';
          } else {
            remainingForNextTier = Math.max(0, amountReq - curAmount);
            unit = 'amount';
          }
        } else {
          // AND: The bottleneck is the lowest percentage
          progressPercentage = Math.min(countPct!, amountPct!);

          // UI Helper: Show remaining for the one lagging behind
          if (countPct! <= amountPct!) {
            remainingForNextTier = Math.max(0, countReq - curCount);
            unit = 'donations';
          } else {
            remainingForNextTier = Math.max(0, amountReq - curAmount);
            unit = 'amount';
          }
        }
      } else if (isCountActive) {
        // CASE: Only Count matters (Amount is 0)
        progressPercentage = countPct!;
        remainingForNextTier = Math.max(0, countReq - curCount);
        unit = 'donations';
      } else if (isAmountActive) {
        // CASE: Only Amount matters (Count is 0)
        progressPercentage = amountPct!;
        remainingForNextTier = Math.max(0, amountReq - curAmount);
        unit = 'amount';
      } else {
        // Fallback for misconfigured badges (both 0)
        progressPercentage = 0;
      }
    }

    return {
      badgeId: badge._id,
      name: badge.name,
      icon: badge.icon,
      description: badge.description,
      type: badge.unlockType,
      isUnlocked: !!userBadge,
      tiers: badge.tiers.map((tier: any) => ({
        tier: tier.tier,
        name: tier.name,
        icon: tier.icon,
        animationUrl: tier.animationUrl,
        smallIconUrl: tier.smallIconUrl,
        isUnlocked:
          userBadge?.tiersUnlocked?.some((t: any) => t.tier === tier.tier) ||
          false,

        isPreviewed:
          userBadge?.previewedTiers?.some((p: any) => p.tier === tier.tier) ||
          false,

        requiredCount: tier.requiredCount,
        requiredAmount: tier.requiredAmount,
      })),
      isCompleted,
      currentTier: currentTierName,
      progress: {
        percentage: Math.floor(progressPercentage),
        remaining: parseFloat(remainingForNextTier.toFixed(2)),
        unit: unit,
        nextTierName: nextTier?.name || 'Max Level',
      },
      // Send raw data for custom UI needs
      rawProgress: {
        count: userBadge?.progressCount || 0,
        amount: userBadge?.progressAmount || 0,
        requiredCount: nextTier?.requiredCount || 0,
        requiredAmount: nextTier?.requiredAmount || 0,
      },
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
/**
 * Core Engine: Checks if current progress qualifies for a tier upgrade.
 * Handles AND/OR logic and ignores requirements set to 0.
 */
const checkTierUpgrade = async (userBadge: any, badge: any): Promise<void> => {
  // 1. If already at the max level, stop.
  if (userBadge.isCompleted) return;

  const currentTier = userBadge.currentTier;
  let nextTierName = '';

  // 2. Determine the name of the next tier to check
  if (badge.isSingleTier) {
    // For single tier badges, the only target is 'one-tier'
    if (currentTier === 'one-tier') return;
    nextTierName = 'one-tier';
  } else {
    // For multi-tier, follow the progression: colour -> bronze -> silver -> gold
    const tierOrder = ['colour', 'bronze', 'silver', 'gold'];
    const currentIdx = tierOrder.indexOf(currentTier);

    if (currentIdx !== -1 && currentIdx < tierOrder.length - 1) {
      nextTierName = tierOrder[currentIdx + 1];
    }
  }

  // If no higher tier exists, stop.
  if (!nextTierName) return;

  // 3. Get the configuration for the target tier
  const targetTierConfig = badge.tiers.find(
    (t: any) => t.tier === nextTierName
  );
  if (!targetTierConfig) return;

  // 4. Requirement Definitions
  const countReq = targetTierConfig.requiredCount || 0;
  const amountReq = targetTierConfig.requiredAmount || 0;

  // Identify which requirements the Admin actually set (> 0)
  const isCountActive = countReq > 0;
  const isAmountActive = amountReq > 0;

  // 5. Evaluate if requirements are met
  const countConditionMet = isCountActive
    ? userBadge.progressCount >= countReq
    : false;
  const amountConditionMet = isAmountActive
    ? userBadge.progressAmount >= amountReq
    : false;

  let canUpgrade = false;

  // 6. Logic Switch (AND / OR)
  if (isCountActive && isAmountActive) {
    if (badge.conditionLogic === 'or') {
      // ANY one of the active requirements is met
      canUpgrade = countConditionMet || amountConditionMet;
    } else {
      // BOTH active requirements must be met
      canUpgrade = countConditionMet && amountConditionMet;
    }
  } else if (isCountActive) {
    // Only Count was set by Admin, ignore Amount
    canUpgrade = countConditionMet;
  } else if (isAmountActive) {
    // Only Amount was set by Admin, ignore Count
    canUpgrade = amountConditionMet;
  } else {
    // Fallback: If both are 0, it's an auto-upgrade (Admin error safeguard)
    canUpgrade = true;
  }

  // 7. Execute Upgrade if eligible
  if (canUpgrade) {
    userBadge.currentTier = nextTierName;
    userBadge.tiersUnlocked.push({
      tier: nextTierName,
      unlockedAt: new Date(),
    });

    // 8. Update History Record
    // Mark the latest history entry with the tier it achieved
    const latestHistory = await UserBadgeHistory.findOne({
      userBadge: userBadge._id,
    }).sort({ createdAt: -1 });

    if (latestHistory) {
      latestHistory.tierAchieved = nextTierName;
      await latestHistory.save();
    }

    // 9. Completion Check
    // If we just hit 'gold' or it's a single-tier badge, mark as finished
    if (nextTierName === 'gold' || badge.isSingleTier) {
      userBadge.isCompleted = true;
    }

    // Save the progress
    await userBadge.save();

    // 10. Send In-App Notification
    try {
      const client = await Client.findById(userBadge.user);
      if (client && client.auth) {
        await createNotification(
          client.auth.toString(),
          NOTIFICATION_TYPE.BADGE_UNLOCKED,
          `Congratulations! You've unlocked the ${targetTierConfig.name} tier for the "${badge.name}" badge!`,
          badge._id.toString(),
          {
            tier: nextTierName,
            badgeName: badge.name,
            badgeId: badge._id.toString(),
          }
        );
      }
    } catch (error) {
      console.error('Badge Notification Error:', error);
    }

    // 11. RECURSION
    // Check again immediately. This allows a user to jump from
    // "Colour" -> "Bronze" -> "Silver" in a single donation if they
    // meet the higher requirements.
    await checkTierUpgrade(userBadge, badge);
  }
};

const markTierVideoPreviewed = async (
  userId: string,
  badgeId: string,
  tier: 'colour' | 'bronze' | 'silver' | 'gold' | 'one-tier'
) => {
  const userBadge = await UserBadge.findOne({
    user: userId,
    badge: badgeId,
  });

  if (!userBadge) {
    throw new AppError(httpStatus.NOT_FOUND, 'User badge not found');
  }

  const isUnlocked = userBadge.tiersUnlocked.some((t) => t.tier === tier);

  if (!isUnlocked) {
    throw new AppError(httpStatus.FORBIDDEN, 'Tier not unlocked');
  }

  const alreadyPreviewed = userBadge.previewedTiers?.some(
    (p) => p.tier === tier
  );

  if (alreadyPreviewed) return;

  userBadge.previewedTiers.push({
    tier,
    previewedAt: new Date(),
  });

  await userBadge.save();
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
  markTierVideoPreviewed,
};
