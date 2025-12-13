/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { Badge, UserBadge } from './badge.model';
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
  IUserBadgeProgress,
  IBadgeTierConfig,
} from './badge.interface';
import { getFileUrl } from '../../lib/upload';
import QueryBuilder from '../../builders/QueryBuilder';

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
  userId: string
): Promise<IUserBadgeProgress[]> => {
  const client = await Client.findOne({ auth: userId });
  if (!client) throw new AppError(httpStatus.NOT_FOUND, 'Client not found');

  const badges = await Badge.find({ isActive: true })
    .sort({ priority: -1 })
    .lean();
  const userBadges = await UserBadge.find({ user: client._id }).lean();

  const userBadgeMap = new Map(
    userBadges.map((ub: any) => [ub.badge.toString(), ub])
  );

  return badges.map((badge: any) => {
    const userBadge = userBadgeMap.get(badge._id.toString()) as any;

    // Determine current state
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

    // Calculate Percentage
    let progressPercentage = 0;
    const count = userBadge?.progressCount || 0;

    if (nextTier) {
      progressPercentage = Math.min(
        100,
        Math.round((count / nextTier.requiredCount) * 100)
      );
    } else if (userBadge?.isCompleted) {
      progressPercentage = 100;
    }

    return {
      badge,
      userBadge,
      isUnlocked,
      currentTier: currentTierName,
      nextTier,
      progressCount: count,
      progressAmount: userBadge?.progressAmount || 0,
      progressPercentage,
      remainingForNextTier: nextTier
        ? Math.max(0, nextTier.requiredCount - count)
        : 0,
    };
  });
};

// --- CORE ENGINE: CHECK & UPDATE (OPTIMIZED) ---

const checkAndUpdateBadgesForDonation = async (
  userId: string,
  donationId: string
) => {
  // 1. Fetch Donation & User (Lean for performance)
  const donation = await Donation.findById(donationId).populate('cause').lean();
  console.log(`BADGE QUERY`, donation);
  if (!donation) return;

  const client = await Client.findById(userId).select('_id').lean();
  if (!client) return;
  console.log(`BADGE QUERY`, client);

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

  console.log(`BADGE QUERY`, query);

  const relevantBadges = await Badge.find(query).lean();
  console.log(`BADGE QUERY`, relevantBadges);
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
  console.log(`BADGE QUERY`, updatePromises);

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

  // 4. Special Handling for complex logic corrections
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

  // 5. Check Tier Upgrade
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

  // Determine next tier
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

  // --- LOGIC FIX STARTS HERE ---

  const logic = badge.conditionLogic || 'or';

  // 1. Determine which requirements are actually active (non-zero)
  const countReq = targetTierConfig.requiredCount || 0;
  const amountReq = targetTierConfig.requiredAmount || 0;

  const hasCountRequirement = countReq > 0;
  const hasAmountRequirement = amountReq > 0;

  // 2. Check individual progress
  const countMet = hasCountRequirement && userBadge.progressCount >= countReq;
  const amountMet =
    hasAmountRequirement && userBadge.progressAmount >= amountReq;

  let passed = false;

  if (logic === 'or') {
    // Pass if (Count is active AND met) OR (Amount is active AND met)
    // If only one is active, that one decides.
    // If both active, either decides.
    passed = countMet || amountMet;
  } else {
    // AND Logic
    // Pass if (Count is met OR not required) AND (Amount is met OR not required)
    const isCountSatisfied = !hasCountRequirement || countMet;
    const isAmountSatisfied = !hasAmountRequirement || amountMet;

    passed = isCountSatisfied && isAmountSatisfied;
  }

  // --- LOGIC FIX ENDS HERE ---

  if (passed) {
    // UPGRADE!
    userBadge.currentTier = nextTierName;
    userBadge.tiersUnlocked.push({
      tier: nextTierName,
      unlockedAt: new Date(),
    });

    if (nextTierName === BADGE_TIER.GOLD || badge.isSingleTier) {
      userBadge.isCompleted = true;
    }

    await userBadge.save();

    // Recursive check for multi-tier jumps
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
};
