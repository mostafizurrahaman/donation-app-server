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

  // Handle Single Tier Logic Update
  if (payload.tiers) {
    const isSingleTier = payload.tiers.length === 1;
    // @ts-ignore
    payload.isSingleTier = isSingleTier;
  }

  return await Badge.findByIdAndUpdate(id, payload, { new: true });
};
const getBadgeById = async (id: string) => {
  return await Badge.findById(id);
};

const getAllBadges = async (query: Record<string, unknown>) => {
  const { isActive } = query;
  const filter: any = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  return await Badge.find(filter).sort({ priority: -1, createdAt: -1 });
};

const deleteBadge = async (id: string) => {
  await Badge.findByIdAndUpdate(id, { isActive: false }); // Soft delete
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
  if (!donation) return;

  const client = await Client.findOne({ auth: userId }).select('_id').lean();
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

    // ✅ FIXED: Seasonal Checks - Now uses constants
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

    // ✅ FIXED: Category Specific - Now normalizes comparison
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
      progressCount: 1,
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
    },
  };

  // 2. Handle Unique Categories (Atomic Array Add)
  if (
    badge.unlockType === BADGE_UNLOCK_TYPE.UNIQUE_CATEGORIES &&
    donation.cause?.category
  ) {
    updateOps.$addToSet = { uniqueCategoryNames: donation.cause.category };
  }

  // 4. ATOMIC FIND-OR-CREATE-AND-UPDATE
  const userBadge = await UserBadge.findOneAndUpdate(
    { user: userId, badge: badge._id },
    updateOps,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

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

  // Streak Logic (Frequency)
  if (badge.unlockType === BADGE_UNLOCK_TYPE.FREQUENCY) {
    // This requires reading the previous month, which makes atomicity hard.
    // For simplicity in this optimization phase, we are incrementing progressCount above.
    // If logic demands rigorous consecutive checks, implement here.
  }

  if (shouldSave) await userBadge.save();

  // 6. Check Tier Upgrade
  await checkTierUpgrade(userBadge, badge);
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

  const countMet = userBadge.progressCount >= targetTierConfig.requiredCount;
  const amountMet = targetTierConfig.requiredAmount
    ? userBadge.progressAmount >= targetTierConfig.requiredAmount
    : false;

  if (logic === 'or') {
    passed = countMet || (targetTierConfig.requiredAmount > 0 && amountMet);
  } else {
    passed =
      countMet && (targetTierConfig.requiredAmount > 0 ? amountMet : true);
  }

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
};
