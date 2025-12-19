/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types, ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import crypto from 'crypto';
import httpStatus from 'http-status';

import { RewardRedemption } from './reward-redeemtion.model';
import { Reward } from '../Reward/reward.model';
import Client from '../Client/client.model';
import Business from '../Business/business.model';
import { pointsServices } from '../Points/points.service';
import { AppError } from '../../utils';

import {
  IClaimResult,
  IRewardRedemptionDocument,
  IClaimRewardPayload,
  ICancelClaimPayload,
  IRedeemRewardPayload,
} from '../Reward/reward.interface';

import {
  CLAIM_EXPIRY_DAYS,
  REDEMPTION_METHOD,
  REDEMPTION_STATUS,
  CANCELLATION_WINDOW_HOURS,
} from './reward-redeemtion.constant';
import { REWARD_MESSAGES, STATIC_POINTS_COST } from '../Reward/reward.constant';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';

// ==========================================
// REWARD CLAIMING & REDEMPTION SERVICES
// ==========================================

/**
 * Claim a reward (deduct points)
 */
const claimReward = async (
  payload: IClaimRewardPayload
): Promise<IClaimResult> => {
  const { rewardId, userId } = payload;
  const idempotencyKey = crypto.randomBytes(16).toString('hex');

  // Check if client exists
  const isClientExists = await Client.findOne({ auth: userId });
  if (!isClientExists) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
  }

  // Check for duplicate claim
  const existingUserClaim = await RewardRedemption.findOne({
    user: isClientExists._id,
    reward: rewardId,
    status: { $in: ['claimed', 'redeemed'] },
  });

  if (existingUserClaim) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_CLAIMED);
  }

  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Atomic reward stock check & decrement
    const reward = await Reward.findOneAndUpdate(
      {
        _id: rewardId,
        remainingCount: { $gt: 0 },
        status: 'active',
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [{ expiryDate: { $gte: new Date() } }, { expiryDate: null }],
      },
      {
        $inc: { remainingCount: -1, redeemedCount: 1, redemptions: 1 },
      },
      { new: true, session, runValidators: true }
    );

    if (!reward) {
      throw new AppError(httpStatus.GONE, REWARD_MESSAGES.RACE_CONDITION);
    }

    // 2. Atomic points deduction (Passing session to prevent write conflict)
    try {
      await pointsServices.deductPoints(
        isClientExists._id?.toString(),
        STATIC_POINTS_COST,
        'reward_redemption',
        undefined, // rewardRedemptionId not created yet
        `Claimed reward: ${reward.title}`,
        {
          rewardId: reward._id.toString(),
          businessId: reward.business.toString(),
        },
        session // ✅ Critical: Pass the session
      );
    } catch (err: any) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        err.message || REWARD_MESSAGES.INSUFFICIENT_POINTS
      );
    }

    // 3. Determine Available Methods & Assign Code
    let assignedCode: string | undefined;
    const availableMethods: string[] = [];
    let finalRedemptionMethod: string | undefined;

    if (reward.type === 'in-store') {
      // Snapshot available methods for in-store
      if (reward.inStoreRedemptionMethods?.qrCode)
        availableMethods.push(REDEMPTION_METHOD.QR_CODE);
      if (reward.inStoreRedemptionMethods?.staticCode)
        availableMethods.push(REDEMPTION_METHOD.STATIC_CODE);
      if (reward.inStoreRedemptionMethods?.nfcTap)
        availableMethods.push(REDEMPTION_METHOD.NFC);

      // Assign static code if available
      if (reward.codes.length > 0) {
        const availableCode = reward.getAvailableCode();
        if (availableCode) {
          assignedCode = availableCode.code;
        }
      }
    } else if (reward.type === 'online') {
      // Snapshot method for online
      if (reward.codes.length > 0) {
        const availableCode = reward.getAvailableCode();
        if (availableCode) {
          assignedCode = availableCode.code;
          const method = availableCode.isGiftCard
            ? REDEMPTION_METHOD.GIFT_CARD
            : REDEMPTION_METHOD.DISCOUNT_CODE;
          availableMethods.push(method);
          finalRedemptionMethod = method; // Auto-set for online
        }
      }
    }

    const expiresAt = new Date(
      Date.now() + CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // 4. Create Redemption Record
    const [redemption] = await RewardRedemption.create(
      [
        {
          user: isClientExists._id,
          reward: rewardId,
          business: reward.business,
          pointsSpent: STATIC_POINTS_COST,
          status: REDEMPTION_STATUS.CLAIMED,
          assignedCode,
          availableRedemptionMethods: availableMethods, // ✅ Stored Snapshot
          redemptionMethod: finalRedemptionMethod,
          idempotencyKey,
          expiresAt,
        },
      ],
      { session }
    );

    // 5. Mark Code as Used
    if (assignedCode) {
      await reward.markCodeAsUsed(
        assignedCode,
        isClientExists._id,
        redemption._id as Types.ObjectId
      );
    }

    // 6. Update Reward Status if Sold Out
    if (reward.remainingCount <= 0) {
      reward.status = 'sold-out';
      await reward.save({ session });
    }

    // create  Claim rewards:
    try {
      await createNotification(
        userId,
        NOTIFICATION_TYPE.REWARD_CLAIMED,
        `You have successfully claimed "${reward.title}". ${
          assignedCode
            ? 'Your redemption code is ready.'
            : 'Please visit the store to redeem.'
        }`,
        redemption._id?.toString(),
        {
          rewardId: reward?._id,
          redeemtionId: redemption._id,
          image: reward?.image,
          assignedCode,
        }
      );
      console.log(`✅ Notification sent for reward claimed`);
    } catch (error) {
      console.log(`❌ Failed to sent notification for claimed`);
    }

    await session.commitTransaction();

    await redemption.populate([
      { path: 'reward', select: 'title description image type category' },
      { path: 'business', select: 'name locations' },
    ]);

    return {
      redemption,
      message: REWARD_MESSAGES.CLAIMED,
      code: assignedCode,
      availableMethods,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Cancel claimed reward and refund points
 */
const cancelClaimedReward = async (
  payload: ICancelClaimPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, userId, reason } = payload;

  // Resolve client ID
  const isClientExists = await Client.findOne({ auth: userId });
  // Fallback to direct ID if passed (e.g. admin action)
  const userObjectId = isClientExists
    ? isClientExists._id
    : new Types.ObjectId(userId);

  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userObjectId,
    status: 'claimed',
  }).populate('reward');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }

  const hoursSinceClaim =
    (Date.now() - redemption.claimedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceClaim > CANCELLATION_WINDOW_HOURS) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANCELLATION_EXPIRED
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Refund points
    const refundTransaction = await pointsServices.refundPoints(
      userId, // Auth ID passed to points service
      redemption.pointsSpent,
      'reward_redemption',
      reason || 'Reward claim cancelled',
      redemptionId,
      undefined,
      session
    );

    // 2. Update status
    redemption.status = 'cancelled';
    redemption.cancelledAt = new Date();
    redemption.cancellationReason = reason;
    redemption.refundTransactionId = refundTransaction.transaction
      ._id as Types.ObjectId;

    await redemption.save({ session });

    // 3. Return stock and code to Reward
    const reward = await Reward.findById(redemption.reward).session(session);
    if (reward) {
      // Return code if assigned
      if (redemption.assignedCode) {
        await reward.returnCode(redemption.assignedCode);
      }

      // Increment stock
      reward.remainingCount += 1;
      reward.redeemedCount = Math.max(0, reward.redeemedCount - 1);

      // Re-activate if it was sold out
      if (reward.status === 'sold-out') {
        reward.status = 'active';
      }

      await reward.save({ session });
    }

    await session.commitTransaction();
    return redemption;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Verify redemption by code or ID (Step 1: Scan/Input)
 */
const verifyRedemption = async (
  staffBusinessId: string,
  code?: string,
  redemptionId?: string
) => {
  const query: any = { status: 'claimed' };

  if (code) {
    query.assignedCode = code;
  } else if (redemptionId) {
    query._id = redemptionId;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Provide code or redemptionId');
  }

  const redemption = await RewardRedemption.findOne(query).populate([
    'reward',
    'business',
    'user',
  ]);

  if (!redemption) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );
  }

  if (redemption.business._id.toString() !== staffBusinessId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This reward does not belong to your business'
    );
  }

  if (new Date() > redemption.expiresAt) {
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  return {
    redemptionId: redemption._id,
    user: redemption.user,
    rewardName: (redemption.reward as any).title,
    status: redemption.status,
    assignedCode: redemption.assignedCode,
    availableMethods: redemption.availableRedemptionMethods,
    expiresAt: redemption.expiresAt,
  };
};

/**
 * Mark reward as redeemed (Step 2: Confirmation)
 */
const redeemReward = async (
  payload: IRedeemRewardPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, code, staffId, location, notes, method } = payload;

  const business = await Business.findOne({ auth: staffId });
  if (!business)
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );

  let redemption;

  // Lookup redemption doc by ID or Code
  if (redemptionId) {
    redemption = await RewardRedemption.findById(redemptionId);
  } else if (code) {
    redemption = await RewardRedemption.findOne({ assignedCode: code });
  }

  if (!redemption)
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );

  if (redemption.business.toString() !== business._id.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This reward does not belong to your business'
    );
  }

  if (redemption.status === 'redeemed')
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_REDEEMED);
  if (redemption.status !== 'claimed')
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_REDEEM_NON_CLAIMED
    );
  if (new Date() > redemption.expiresAt) {
    redemption.status = 'expired';
    redemption.expiredAt = new Date();
    await redemption.save();
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  // ✅ VALIDATE METHOD: Ensure method matches the snapshot allowed list
  if (!redemption.availableRedemptionMethods.includes(method)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid redemption method: '${method}'. Allowed methods: ${redemption.availableRedemptionMethods.join(
        ', '
      )}`
    );
  }

  redemption.status = 'redeemed';
  redemption.redeemedAt = new Date();
  redemption.redemptionMethod = method; // ✅ Record specific method used
  redemption.redeemedByStaff = new Types.ObjectId(business._id);
  if (location) redemption.redemptionLocation = location;
  if (notes) redemption.redemptionNotes = notes;

  await redemption.save();

  return redemption.populate([
    { path: 'reward', select: 'title description image type category' },
    { path: 'business', select: 'name locations' },
  ]);
};

/**
 * Get user's claimed rewards
 */
const getUserClaimedRewards = async (
  userId: string,
  options: { includeExpired?: boolean; page?: number; limit?: number } = {}
): Promise<{ redemptions: IRewardRedemptionDocument[]; total: number }> => {
  const { includeExpired = false, page = 1, limit = 20 } = options;
  const filter: Record<string, unknown> = { user: userId };

  if (includeExpired) {
    filter.status = { $ne: 'cancelled' };
  } else {
    filter.status = 'claimed';
    filter.expiresAt = { $gt: new Date() };
  }

  const skip = (page - 1) * limit;
  const [redemptions, total] = await Promise.all([
    RewardRedemption.find(filter)
      .populate('reward', 'title description image type category pointsCost')
      .populate('business', 'name locations coverImage')
      .sort('-claimedAt')
      .skip(skip)
      .limit(limit),
    RewardRedemption.countDocuments(filter),
  ]);

  return { redemptions, total };
};

/**
 * Get claimed reward by ID
 */
const getClaimedRewardById = async (
  redemptionId: string,
  userId: string
): Promise<IRewardRedemptionDocument> => {
  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userId,
  })
    .populate('reward', 'title description image type category pointsCost')
    .populate('business', 'name locations coverImage');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }
  return redemption;
};

/**
 * Expire old claims with full restoration
 */
const expireOldClaimsWithFullRestoration = async (): Promise<{
  totalProcessed: number;
  expiredCount: number;
  codesReturned: number;
  pointsRefunded: number;
  stockRestored: number;
  errors: Array<{ claimId: string; error: string }>;
}> => {
  const now = new Date();
  const result = {
    totalProcessed: 0,
    expiredCount: 0,
    codesReturned: 0,
    pointsRefunded: 0,
    stockRestored: 0,
    errors: [] as Array<{ claimId: string; error: string }>,
  };

  const expiredClaims = await RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $lte: now },
  });

  result.totalProcessed = expiredClaims.length;

  if (expiredClaims.length === 0) return result;

  for (const claim of expiredClaims) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      claim.status = 'expired';
      claim.expiredAt = now;
      await claim.save({ session });

      try {
        // Get Auth ID from Client ID to pass to points service
        const client = await Client.findById(claim.user);
        const authUserId = client
          ? client.auth.toString()
          : claim.user.toString();

        const refundResult = await pointsServices.refundPoints(
          authUserId,
          claim.pointsSpent,
          'claim_expired',
          `Reward claim expired - automatic refund for claim ${claim._id}`,
          claim._id.toString(),
          undefined,
          session // ✅ Critical: Pass the session
        );

        if (refundResult && refundResult.transaction) {
          claim.refundTransactionId = refundResult.transaction
            ._id as Types.ObjectId;
          await claim.save({ session });
          result.pointsRefunded += claim.pointsSpent;
        }
      } catch (refundError) {
        console.error(
          `[EXPIRATION] Failed to refund points for claim ${claim._id}:`,
          refundError
        );
      }

      await session.commitTransaction();
      result.expiredCount++;
    } catch (error: any) {
      await session.abortTransaction();
      result.errors.push({
        claimId: claim._id.toString(),
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  }
  return result;
};

/**
 * Get expiring claims
 */
const getExpiringClaims = async (hoursUntilExpiry = 24) => {
  const now = new Date();
  const expiryThreshold = new Date(
    now.getTime() + hoursUntilExpiry * 60 * 60 * 1000
  );
  return RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $gt: now, $lte: expiryThreshold },
  }).populate('user name email reward title business name');
};

/**
 * Get user expiration summary
 */
const getUserExpirationSummary = async (userId: string) => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [expiringIn24Hours, expiringIn7Days, totalActive] = await Promise.all([
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in24Hours },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in7Days },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now },
    }),
  ]);

  return { expiringIn24Hours, expiringIn7Days, totalActive };
};

export const rewardRedemptionService = {
  claimReward,
  cancelClaimedReward,
  verifyRedemption,
  redeemReward,
  getUserClaimedRewards,
  getClaimedRewardById,
  expireOldClaimsWithFullRestoration,
  getExpiringClaims,
  getUserExpirationSummary,
};
